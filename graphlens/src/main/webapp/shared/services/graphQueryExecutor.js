/**
 * Executes a parsed graph-query AST (see graphQueryLanguage.js) against
 * live Splunk data. This module introduces no new SPL shapes and no new
 * injection surface: every search it runs is dispatched through one of the
 * two existing, already-reviewed templates in splTemplates.js
 * (buildInitialEntitySearchSpl for the root field's "search"/"id"
 * arguments, buildExpandNodeSpl - at most once per distinct node - for
 * every relationship field under it), using the same validated/escaped
 * argument pipeline (sanitizeSearchTerm, isValidId) the rest of the app
 * already uses for the entity search box and node expansion. Relationship
 * type and direction selection is applied client-side, as a filter over
 * rows those searches already returned - exactly like the existing
 * hiddenRelationshipTypes filter elsewhere in the app - never spliced into
 * new SPL text. See SECURITY.md and ARCHITECTURE.md for the fuller
 * explanation.
 *
 * Bounds enforced here, independent of each template's own internal
 * clamping:
 *  - a static check that the query's relationship nesting does not exceed
 *    settings.maxExpansionDepth, performed before any search is dispatched;
 *  - MAX_QUERY_EXPANSIONS, a hard ceiling on the number of buildExpandNodeSpl
 *    dispatches a single query execution may issue in total;
 *  - ancestor-path cycle detection, so a relationship field is never
 *    recursed into for a node already on its own branch back to the root;
 *  - each relationship field's own `limit` argument, clamped against
 *    settings.maxExpansionNeighbours.
 */
import { buildInitialEntitySearchSpl, buildExpandNodeSpl } from './splTemplates';
import { transformRowsToGraph } from './graphTransformer';
import { relationshipSourceFromSettings } from './configService';
import { sanitizeSearchTerm, isValidId, clampInteger, GraphLensValidationError } from '../utilities/splSafety';

export const SCALAR_FIELDS = Object.freeze([
  'id', 'label', 'type', 'group', 'description', 'riskScore',
  'eventCount', 'firstSeen', 'lastSeen', 'sourceIndex', 'sourceSourcetype',
]);

const DIRECTION_VALUES = Object.freeze(['OUTGOING', 'INCOMING', 'BOTH']);

// See the module comment above - this bounds total search dispatches
// across an entire query execution, regardless of depth/limit arguments,
// so a query with several relationship fields nested a few levels deep
// cannot fan out to an unbounded number of searches.
export const MAX_QUERY_EXPANSIONS = 200;

// Each of these returns undefined for an *absent* argument (callers apply
// their own default), but throws for one that is *present* with the wrong
// kind of value - e.g. `type: host` (a bare word) where a quoted string is
// required - rather than silently falling back to a default the user never
// asked for, which would otherwise look like the argument was accepted but
// simply had no effect.
function argString(args, name) {
  const v = args[name];
  if (v === undefined) return undefined;
  if (typeof v !== 'string') {
    throw new GraphLensValidationError(`The "${name}" argument must be a quoted string.`, name);
  }
  return v;
}

function argInt(args, name) {
  const v = args[name];
  if (v === undefined) return undefined;
  if (typeof v !== 'number') {
    throw new GraphLensValidationError(`The "${name}" argument must be an integer.`, name);
  }
  return v;
}

function argEnum(args, name) {
  const v = args[name];
  if (v === undefined) return undefined;
  if (!(v && typeof v === 'object' && typeof v.enum === 'string')) {
    throw new GraphLensValidationError(`The "${name}" argument must be a bare word (e.g. OUTGOING), not a quoted string or number.`, name);
  }
  return v.enum;
}

function scalarFields(selectionSet) {
  return selectionSet.filter((f) => !f.selectionSet);
}

function relationshipFields(selectionSet) {
  return selectionSet.filter((f) => !!f.selectionSet);
}

// Validates the whole query's shape and argument types up front, before
// any search is dispatched - the same "fail before touching Splunk"
// guarantee the depth check already gives, just extended to argument
// correctness and relationship-field validity at every nesting level.
function validateSelectionSet(selectionSet) {
  const seenNames = new Set();
  selectionSet.forEach((field) => {
    if (seenNames.has(field.name)) {
      // This grammar has no field aliases (see KNOWN_LIMITATIONS.md), so a
      // field's name doubles as its key in the result tree - a second field
      // with the same name would silently overwrite the first's entry
      // instead of erroring, discarding whichever was resolved first.
      throw new GraphLensValidationError(
        `Field "${field.name}" is used more than once in the same selection set. This grammar has no field aliases, so each field name can only appear once per selection set - give each relationship field a distinct name (an explicit "type" argument supplies the real relationship_type to match) rather than repeating this one.`,
        field.name,
      );
    }
    seenNames.add(field.name);
    if (field.selectionSet) {
      argString(field.arguments, 'type');
      const direction = argEnum(field.arguments, 'direction');
      if (direction !== undefined && !DIRECTION_VALUES.includes(direction)) {
        throw new GraphLensValidationError(
          `Invalid direction "${direction}" on field "${field.name}" - must be one of ${DIRECTION_VALUES.join(', ')}.`,
          'direction',
        );
      }
      argInt(field.arguments, 'limit');
      validateSelectionSet(field.selectionSet);
    } else if (!SCALAR_FIELDS.includes(field.name)) {
      throw new GraphLensValidationError(
        `Unknown field "${field.name}". Expected one of: ${SCALAR_FIELDS.join(', ')}, or a relationship field with a nested selection set.`,
        field.name,
      );
    }
  });
}

function validateRootArguments(args) {
  const idArg = argString(args, 'id');
  const searchArg = argString(args, 'search');
  argString(args, 'type');
  argInt(args, 'limit');
  if (idArg === undefined && searchArg === undefined) {
    throw new GraphLensValidationError('The "node" root field needs either a "search" or an "id" argument.', 'node');
  }
}

function measureRelationshipDepth(selectionSet) {
  const relFields = relationshipFields(selectionSet);
  if (relFields.length === 0) return 0;
  return 1 + Math.max(...relFields.map((f) => measureRelationshipDepth(f.selectionSet)));
}

function buildScalarEntry(nodeData, selectionSet) {
  const entry = { id: nodeData.id };
  scalarFields(selectionSet).forEach((f) => { entry[f.name] = nodeData[f.name]; });
  return entry;
}

function applyTypeFilter(nodeDataList, typeFilter) {
  if (!typeFilter) return nodeDataList;
  return nodeDataList.filter((n) => n.type === typeFilter);
}

/** Folds a transformRowsToGraph() diagnostics object into the execution's overall truncation flag. */
function noteTruncation(ctx, diagnostics) {
  if (diagnostics && diagnostics.limitReached) {
    ctx.diagnostics.truncated = true;
  }
}

/** Expands a node's relationships at most once per query execution, regardless of how many relationship fields - or the root resolver itself - reference it. */
function expandNodeOnce(nodeId, ctx) {
  if (ctx.expandCache.has(nodeId)) {
    return ctx.expandCache.get(nodeId);
  }
  const promise = (async () => {
    if (ctx.budget.expansions >= MAX_QUERY_EXPANSIONS) {
      ctx.diagnostics.truncated = true;
      return { nodes: [], edges: [] };
    }
    ctx.budget.expansions += 1;
    const expansionLimit = clampInteger(ctx.settings ? ctx.settings.maxExpansionNeighbours : undefined, { min: 1, max: 5000, fallback: 100 });
    const source = relationshipSourceFromSettings(ctx.settings || {});
    const spl = buildExpandNodeSpl(nodeId, expansionLimit, source);
    const { rows } = await ctx.dispatch(spl);
    const result = transformRowsToGraph([], rows, {
      maxNodes: ctx.settings ? ctx.settings.maxVisibleNodes : undefined,
      maxEdges: ctx.settings ? ctx.settings.maxVisibleEdges : undefined,
      nodeTypeConfig: ctx.nodeTypeConfig,
      relationshipTypeConfig: ctx.relationshipTypeConfig,
    });
    noteTruncation(ctx, result.diagnostics);
    return result;
  })();
  ctx.expandCache.set(nodeId, promise);
  return promise;
}

async function resolveRootNodes(args, ctx) {
  const limit = clampInteger(argInt(args, 'limit'), { min: 1, max: 100, fallback: 20 });
  const typeFilter = argString(args, 'type');
  const idArg = argString(args, 'id');
  const searchArg = argString(args, 'search');

  if (idArg !== undefined) {
    if (!isValidId(idArg)) {
      throw new GraphLensValidationError('The "id" argument is not a valid GraphLens identifier.', 'id');
    }
    // No standalone "fetch one node's own metadata" search is wired into
    // the app (see splTemplates.js's buildNodeDetailsSpl comment), so an
    // id-rooted query resolves the node via its own one-hop expansion: a
    // node with zero relationships cannot be resolved this way, and is
    // documented as a known limitation. Routed through expandNodeOnce (not
    // a second, separate dispatch) so a query that also follows a
    // relationship field from this same root reuses this same expansion
    // instead of searching for it twice.
    const { nodes } = await expandNodeOnce(idArg, ctx);
    const match = nodes.find((n) => n.data.id === idArg);
    return applyTypeFilter(match ? [match.data] : [], typeFilter);
  }

  // searchArg !== undefined is the only remaining case - validateRootArguments
  // already guarantees one of id/search was given.
  const { splSafe } = sanitizeSearchTerm(searchArg);
  const source = relationshipSourceFromSettings(ctx.settings || {});
  const spl = buildInitialEntitySearchSpl(splSafe, limit, source);
  const { rows } = await ctx.dispatch(spl);
  const { nodes, diagnostics } = transformRowsToGraph(rows, [], { maxNodes: limit, nodeTypeConfig: ctx.nodeTypeConfig });
  noteTruncation(ctx, diagnostics);
  return applyTypeFilter(nodes.map((n) => n.data), typeFilter).slice(0, limit);
}

// Resolves one relationship field's neighbours (expansion + filter + the
// per-neighbour subtree). Independent of every other field on the same
// node and every other neighbour within this field - callers run these
// concurrently via Promise.all, which is safe because the only shared
// mutable state (ctx.nodesById/edgesById/expandCache/budget) is only ever
// touched synchronously between awaits (see expandNodeOnce's comment).
async function buildRelationshipField(nodeData, field, ctx, ancestors) {
  const relTypeFilter = (argString(field.arguments, 'type') || field.name).toLowerCase();
  const direction = (argEnum(field.arguments, 'direction') || 'BOTH').toUpperCase();
  const fieldLimit = clampInteger(argInt(field.arguments, 'limit'), {
    min: 1,
    max: ctx.settings ? ctx.settings.maxExpansionNeighbours : 5000,
    fallback: ctx.settings ? ctx.settings.maxExpansionNeighbours : 20,
  });

  const { nodes: expandedNodes, edges: expandedEdges } = await expandNodeOnce(nodeData.id, ctx);
  const neighbourDataById = new Map(expandedNodes.map((n) => [n.data.id, n.data]));

  const matched = expandedEdges
    .map((e) => e.data)
    .filter((e) => e.relationship && e.relationship.toLowerCase() === relTypeFilter)
    .filter((e) => {
      if (direction === 'OUTGOING') return e.source === nodeData.id;
      if (direction === 'INCOMING') return e.target === nodeData.id;
      return e.source === nodeData.id || e.target === nodeData.id;
    })
    .slice(0, fieldLimit);

  const neighbourEntries = await Promise.all(matched.map(async (edge) => {
    const neighbourId = edge.source === nodeData.id ? edge.target : edge.source;
    const neighbourData = neighbourDataById.get(neighbourId);
    if (!neighbourData) return null;

    ctx.edgesById.set(edge.id, edge);
    if (!ctx.nodesById.has(neighbourId)) ctx.nodesById.set(neighbourId, neighbourData);

    if (ancestors.has(neighbourId)) {
      // Refuse to recurse into a node already on this branch's path back
      // to the root - the edge/node are still included in the result,
      // but the branch stops here instead of looping forever.
      return { ...buildScalarEntry(neighbourData, field.selectionSet), cycleTruncated: true };
    }
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(neighbourId);
    return buildTreeNode(neighbourData, field.selectionSet, ctx, nextAncestors); // eslint-disable-line no-use-before-define
  }));

  return neighbourEntries.filter((e) => e !== null);
}

async function buildTreeNode(nodeData, selectionSet, ctx, ancestors) {
  const entry = buildScalarEntry(nodeData, selectionSet);

  const fieldEntries = await Promise.all(
    relationshipFields(selectionSet).map(async (field) => [
      field.name,
      await buildRelationshipField(nodeData, field, ctx, ancestors),
    ]),
  );
  fieldEntries.forEach(([name, entries]) => { entry[name] = entries; });

  return entry;
}

/**
 * @param {Object} ast - result of parseGraphQuery()
 * @param {Object} context
 * @param {Object} [context.settings] - as returned by configService.getSettings()
 * @param {Object} [context.nodeTypeConfig]
 * @param {Object} [context.relationshipTypeConfig]
 * @param {function(string): Promise<{rows: Array<Object>}>} context.dispatch - runs one SPL string and resolves its rows; injectable for tests
 * @returns {Promise<{tree: Array<Object>, nodes: Array, edges: Array, diagnostics: {truncated: boolean, totalExpansions: number}}>}
 */
export async function executeGraphQuery(ast, context) {
  if (!context || typeof context.dispatch !== 'function') {
    throw new GraphLensValidationError('A dispatch function is required to execute a graph query.', 'context');
  }
  const { settings, nodeTypeConfig = {}, relationshipTypeConfig = {}, dispatch } = context;
  const { selectionSet } = ast.root;

  validateRootArguments(ast.root.arguments);
  validateSelectionSet(selectionSet);

  const relDepth = measureRelationshipDepth(selectionSet);
  const maxDepth = settings && Number.isFinite(settings.maxExpansionDepth) ? settings.maxExpansionDepth : 3;
  if (relDepth > maxDepth) {
    throw new GraphLensValidationError(
      `Query traverses ${relDepth} relationship hop(s) deep, exceeding the configured maximum expansion depth of ${maxDepth}.`,
      'depth',
    );
  }

  const ctx = {
    settings,
    nodeTypeConfig,
    relationshipTypeConfig,
    dispatch,
    budget: { expansions: 0 },
    diagnostics: { truncated: false },
    expandCache: new Map(),
    nodesById: new Map(),
    edgesById: new Map(),
  };

  const rootNodes = await resolveRootNodes(ast.root.arguments, ctx);
  rootNodes.forEach((n) => ctx.nodesById.set(n.id, n));

  // Independent root matches (from a broad "search") never share an
  // ancestor path, so their subtrees are safe to resolve concurrently.
  const tree = await Promise.all(
    rootNodes.map((node) => buildTreeNode(node, selectionSet, ctx, new Set([node.id]))),
  );

  return {
    tree,
    nodes: Array.from(ctx.nodesById.values()).map((data) => ({ data })),
    edges: Array.from(ctx.edgesById.values()).map((data) => ({ data })),
    diagnostics: { truncated: ctx.diagnostics.truncated, totalExpansions: ctx.budget.expansions },
  };
}
