# Architecture

## Summary

GraphLens is a browser-rendered, Splunk-native application. Splunk itself
provides authentication, authorisation, search execution, data storage and
auditability; GraphLens contributes only client-side rendering/state logic
and a set of controlled, pre-defined search templates. There is no
separate application server, database, or backend process of any kind.

```
Splunk indexes (graphlens_relationships, evidence indexes)
KV Store collections (graphlens_nodes, graphlens_edges, graphlens_node_types,
                       graphlens_relationship_types, graphlens_saved_views,
                       graphlens_annotations, graphlens_audit_log)
        |
        | default/savedsearches.conf (controlled SPL, args.* tokens only)
        v
Splunk REST API (services/search/jobs, services/storage/collections/data/*,
                  services/properties/*, services/authentication/current-context)
        |
        v
Splunk Web (Mako view -> static HTML shell -> bundled JS/CSS)
        |
        v
React application (src/main/webapp/pages/*)
        |
        v
GraphLens shared layer (src/main/webapp/shared/*):
  searchService, kvStoreService, auditService, configService,
  capabilityService, graphTransformer, graphStateReducer, pathFinder,
  exportService, importService, splSafety
        |
        v
Cytoscape.js canvas (GraphCanvas.jsx)
```

## How Splunk stores the data

Three storage modes, chosen per use case (see DATA_MODEL.md):

- **Indexed relationships** (`graphlens_relationships` index by default,
  configurable in `graphlens_settings.conf`) hold high-volume, time-series
  observed relationships - authentication events, process activity,
  network connections, detection evidence. These are never held in KV
  Store.
- **KV Store** holds low-volume, curated data: node/edge metadata
  curation, node/relationship type display configuration, saved graph
  views, annotations, and the audit log.
- **Hybrid**: the `buildNodeDetailsSpl` template (see
  `shared/services/splTemplates.js`) joins indexed relationship data with
  curated KV Store metadata via `| lookup` (see `default/transforms.conf`),
  so the graph the user sees is a merge of observed and curated data without the
  browser needing to know which source contributed which field.

## How searches retrieve relationships

Two dispatch paths are used, chosen per search (see SECURITY.md for the
full injection-prevention discussion):

- **Named saved searches** (`default/savedsearches.conf`), for the two
  searches with no per-request dynamic value: `graphlens_graph_statistics`
  and `graphlens_health`.
- **Ad-hoc dispatch** of a complete SPL string built from a fixed template
  in `shared/services/splTemplates.js`, using already-validated/escaped
  values, for every search that needs a per-request value. An earlier
  design tried to parameterise named saved searches via `$token$`
  placeholders substituted through `args.<token>` on the dispatch REST
  call; confirmed against a live Splunk instance, that does not work -
  the dispatched job still contains the literal, unresolved `$token$`
  text. See splTemplates.js's doc comment and CHANGELOG.md for the full
  story.

| Template (in splTemplates.js) | Purpose |
|---|---|
| `buildInitialEntitySearchSpl` | Locate candidate entities for the entity search box |
| `buildExpandNodeSpl` | One-hop expansion of a single node |
| `buildNodeDetailsSpl` | Aggregated node properties + curated metadata (not currently wired to the UI - see KNOWN_LIMITATIONS.md) |
| `buildEdgeDetailsSpl` | Aggregated edge properties (not currently wired to the UI) |
| `buildEvidenceSpl` | Bounded supporting-event retrieval for a node or edge |
| `buildClusterExpandSpl` | Optional bounded expansion of a collapsed cluster/group node (not currently wired to the UI) |
| `graphlens_graph_statistics` (saved search) | Aggregate counts for limit/health reporting - not currently dispatched from the UI (see KNOWN_LIMITATIONS.md) |
| `graphlens_health` (saved search) | Recent audited actions, for the Health page |

All five relationship-reading templates (everything above except
`buildEvidenceSpl`, which always reads raw evidence events from an index)
take a `source` argument built by `configService.js`'s
`relationshipSourceFromSettings()` from the Configuration page's
"Relationship data source" setting: `{ type: 'index', index }` generates
`search index="<index>" ...`; `{ type: 'lookup', lookupName }` generates
`| inputlookup <lookup> | search ...` instead; `{ type: 'saved_search',
savedSearchName }` generates `| savedsearch "<name>" | search ...`;
`{ type: 'dataset', datasetName }` generates `| from datamodel:"<name>" |
search ...` - confirmed against a live instance that `| inputlookup`, `|
savedsearch` and `| from datamodel:` all work as the sole leading
(generating) command for ad-hoc dispatch, the same way `search
index=...` does, and that the `| search` filter stage and a bracketed
`append [ ... ]` subsearch behave identically regardless of which of the
four leads. Both `savedsearch`'s and `from datamodel:`'s names are
embedded in double quotes (unlike index/lookup names, which are
stricter-grammar bare identifiers) since a real saved search name
commonly has spaces, and quoting a dataset name costs nothing even though
a data model's own `modelName` never does (see
`DATASET_NAME_PATTERN`'s comment in splSafety.js) -
`safeSavedSearchNameOrFallback`/`safeDatasetNameOrFallback` validate
first and `escapeSplStringLiteral` escapes before embedding, the same
defence-in-depth pairing already used elsewhere in this module. See
DATA_INGESTION.md for when to use each of the four, SECURITY.md's "Saved
search as a relationship data source" (also covers Table Dataset mode)
for why those two are gated by their own shared capability, and
CHANGELOG.md 1.2.0 for why the index/lookup design replaced a static
`graphlens_relationship_index` macro that the Configuration page's
"Relationship index" field never actually fed into.

`searchService.js` exposes `dispatchSavedSearch` (named saved search,
`services/saved/searches/<name>/dispatch`) and `dispatchAdHocSearch`
(complete SPL string, `services/search/jobs`). Both share the same
poll/cancel/timeout machinery: polling `services/search/jobs/<sid>` until
`dispatchState=DONE` (with exponential backoff and a configurable
timeout), reading results from `services/search/jobs/<sid>/results`, and
cancelling an in-flight or abandoned job via
`services/search/jobs/<sid>/control`.

Every value spliced into an ad-hoc template is still validated/escaped by
`utilities/splSafety.js` first (identifiers via `assertValidId`/`isValidId`,
free text via `sanitizeSearchTerm`, limits via `clampInteger` returning a
plain number) - nothing user-controlled reaches SPL unvalidated. Identifiers
also get a second, independent server-side check: each template that takes
one embeds `` | where match("<id>", `graphlens_id_pattern`) `` using a
macro holding the same regex, so a bug in the client-side check alone
cannot let an invalid identifier through.

## How SUIT renders the interface

Each page (`RelationshipExplorer`, `ConfigurationPage`, `HealthPage`,
`HelpPage`) is a small React application built with `@splunk/react-ui`
components, entered through `src/main/webapp/pages/<Page>/index.jsx`
(each wrapped in `@splunk/themes`' `SplunkThemeProvider` - see
KNOWN_LIMITATIONS.md's theming note below), compiled by webpack into
`appserver/static/build/pages/<Page>/App.js` + `App.css`. A thin Mako view
(`default/data/ui/views/<name>.xml` -> `appserver/templates/<Page>.html`)
provides the page shell and loads the compiled bundle from a hardcoded
absolute static path (`/static/app/graphlens/build/pages/<Page>/App.js`
- not `${make_url(...)}`, which turned out not to be defined in this
namespace and caused a live HTTP 500; see CHANGELOG.md 1.0.1). **These
views render with no Splunk Web chrome at all** (no app switcher, no
header, no navigation) - confirmed as an unconditional platform
characteristic of `type="html"` custom views, not something this app's
templates control; GraphLens provides its own in-app navigation instead
(`shared/components/PageNav.jsx`) - see KNOWN_LIMITATIONS.md, "No Splunk
Web chrome around `type=\"html\"` views". The templates intentionally
contain **no Mako Python code blocks** (`<% %>` / `<%! %>`), only
`<%inherit>`/`<%block>` directives and `${}` expressions, because Splunk
AppInspect's `check_for_existence_of_python_code_block_in_mako_template`
check flags any custom Mako template containing an actual code block as a
critical risk. See DEVELOPMENT.md for the verification note on this.

## How Cytoscape.js renders the graph

`GraphCanvas.jsx` owns a single `cytoscape` instance for the page's
lifetime. Element updates (`nodes`/`edges` props changing) are applied
incrementally with `cy.batch()` - added/updated/removed individually,
never a full teardown/rebuild - so panning, zoom and selection state
survive ordinary updates. Layout is only re-run when an explicit
`layoutToken` changes (a fresh search, an expansion, or the user clicking
"Recalculate layout"), never on selection or hover, per the performance
requirement to avoid expensive relayout on every interaction.

## How expansion and collapse operate

Graph state is a plain, framework-agnostic reducer
(`shared/services/graphStateReducer.js`, bound to React via
`shared/hooks/useGraphState.js`) implementing reference-counted lazy
expansion:

- **Expand**: validate the node id, no-op if already expanded, dispatch
  the `buildExpandNodeSpl` ad-hoc search, transform the result rows into Cytoscape
  elements (`graphTransformer.js`, which also deduplicates and enforces
  `maxVisibleNodes`/`maxVisibleEdges`), then `mergeExpansion` records a
  parent -> child link for every neighbour introduced (a neighbour that
  was already visible from another expansion gets an *additional* parent
  link, not a duplicate node).
- **Collapse**: `collapseNode` removes the parent -> child link the
  collapsed node contributed to each of its children. A child is only
  actually removed from the graph if it has **no remaining parent link**,
  is **not pinned**, and **is not the currently selected node**. Removal
  cascades: if a removed child was itself expanded, its own children are
  processed the same way. The collapsed node itself is never removed -
  only what it introduced - so it can be expanded again later.

This is unit-tested exhaustively in `tests/unit/graphStateReducer.test.js`,
including the "diamond" case (a node reachable through two expansion
paths survives collapsing one of them) and a three-level cascade case.

## How export and import round-trip a graph

`exportService.js`'s `exportGraphAsJson` and `importService.js`'s
`parseImportedGraphJson` are exact counterparts: the JSON export's
`nodes`/`edges` shape is just `visibleNodes`/`visibleEdges` sanitised for
output, and import reverses that mapping back into the raw `node_id`/
`source_id`/... "row" shape, then feeds it through the same
`graphTransformer.transformRowsToGraph` a live search result goes through
- nothing from an imported file is trusted any more than a Splunk search
result would be (invalid identifiers are dropped, labels are escaped, the
same `maxVisibleNodes`/`maxVisibleEdges` limits apply). The resulting
Cytoscape elements replace the whole graph via `loadGraphSnapshot` (in
`graphStateReducer.js`, alongside `mergeExpansion`/`collapseNode`) - like
`resetGraph` followed by loading several "root" nodes at once, so
imported nodes carry no expansion parent/child link and can still be
expanded further afterwards. The file itself is read client-side via the
browser's `FileReader` API and never uploaded anywhere; import is a
convenience for resuming or sharing a graph snapshot, not a path for
bringing Splunk data into GraphLens (see DATA_INGESTION.md for that).

## How "Load from job" attaches to an already-dispatched search (1.17.0)

The toolbar **Load from job** action takes a user-supplied job id (sid)
and loads that job's results onto the canvas, replacing the whole graph -
the live-search counterpart to Import above, for a search the user (or
someone who shared it with them) already ran, in Splunk Web's own Search
app or anywhere else. It deliberately reuses two existing abstractions
rather than introducing new ones:

- `searchService.js`'s `attachToJob(sid, options)` calls the same shared
  `createJobHandle` helper `dispatchSavedSearch`/`dispatchAdHocSearch`
  already use, with a `startJob` that simply returns the given sid
  instead of POSTing to create a new job. It exposes the identical
  `{sid, waitForResults(), cancel()}` handle, so polling, timeout and
  result-fetching behave exactly as they do for a search GraphLens
  dispatched itself.
- `jobResultsService.js`'s `classifyJobResultRows(rows)` inspects each
  raw result row's own fields to split them into node rows (`node_id`)
  and edge rows (`source_id`+`target_id`+`relationship_type`), since
  GraphLens cannot know in advance whether an arbitrary job's results
  look like a one-hop expansion, a plain entity list, or a mix of both -
  mirroring `importService.js`'s same defensive stance toward a parsed
  file. Rows matching neither shape are silently dropped and counted.

The classified rows are then fed through the same
`graphTransformer.transformRowsToGraph` every other relationship source
uses, and loaded via `loadGraphSnapshot` exactly as Import does - so a
job's results are validated, escaped and limit-enforced identically to a
live search's own results. This is a one-time action, not a fifth
`relationship_source_type`: a job's results are themselves ephemeral
(Splunk expires them on its own TTL once the job finishes, unless pinned
or scheduled), unlike an index, lookup, saved search or dataset's name,
which is why it has no corresponding persistent setting.

## How the query language compiles to existing searches

`shared/services/graphQueryLanguage.js` and `graphQueryExecutor.js`
implement the Relationship Explorer's text query panel - a restricted,
GraphQL-like syntax for selecting a starting node and which of its
relationships to follow, so a user can describe several hops of expansion
in one request instead of clicking Expand repeatedly.

- **`graphQueryLanguage.js`** is a hand-rolled tokenizer and
  recursive-descent parser (not the `graphql` npm package - the supported
  grammar is a small, fixed subset with no fragments, variables, aliases
  or directives, and adding a general-purpose parsing dependency would
  grow the audited surface for no benefit, matching this project's
  existing practice of hand-writing its own narrow parsers/validators
  rather than importing one; see `splSafety.js`). It only turns query text
  into a plain-object AST and throws `GraphLensValidationError` on syntax
  errors - it has no knowledge of Splunk, SPL, or settings-driven limits.
- **`graphQueryExecutor.js`**'s `executeGraphQuery(ast, context)` walks
  that AST and resolves it entirely by reusing the same two
  already-reviewed templates every other part of the app already
  dispatches: `buildInitialEntitySearchSpl` (for the root field's
  `search`/`id` arguments, through the same `sanitizeSearchTerm`/
  `isValidId` validation the entity search box uses) and
  `buildExpandNodeSpl` - dispatched **at most once per distinct node**,
  however many relationship fields reference it - for every relationship
  field under it. **No new SPL shape is ever constructed from query
  input**: a relationship field's name/`type`/`direction` arguments are
  matched client-side against `relationship_type`/`source_id`/`target_id`
  on rows those two templates already returned, exactly like the existing
  `hiddenRelationshipTypes` filter elsewhere in the app. See SECURITY.md
  for why this introduces no new injection surface.
- `context.dispatch` is an injected `function(spl)` so the executor can be
  unit-tested without a live Splunk instance
  (`tests/unit/graphQueryExecutor.test.js` mocks it); in the app,
  `RelationshipExplorer/App.jsx` supplies the same `dispatchAdHocSearch` +
  `waitForResults` call shape `handleSearch`/`handleExpandNode` use.
- The whole query's shape is validated **before any search runs**: every
  field name (scalar or relationship) and every argument's type (a
  `type`/`search`/`id` must be a quoted string, `direction` a bare word,
  `limit` an integer - a value of the wrong kind throws immediately rather
  than being silently ignored and falling back to a default the user never
  asked for), at every nesting level, plus the static depth check below -
  all of it runs up front, so a malformed query anywhere in the tree never
  gets partway through dispatching searches before failing.
- Execution is bounded four ways beyond that, independent of each
  template's own internal clamping: the same static depth check (that the
  query's relationship nesting does not exceed
  `settings.maxExpansionDepth`); `MAX_QUERY_EXPANSIONS`, a hard ceiling on
  total `buildExpandNodeSpl` dispatches per execution; ancestor-path cycle
  detection, so a branch never recurses back into a node already on its
  own path to the root; and each relationship field's own `limit`
  argument, clamped against `settings.maxExpansionNeighbours`.
- Independent branches - different root matches from a broad `search`,
  different relationship fields on the same node, different neighbours
  matched by the same field - are resolved concurrently (`Promise.all`),
  not one at a time. This is safe without locking because the executor's
  only shared mutable state (the node/edge accumulators, the per-node
  expansion cache, the expansion-count budget) is always read and written
  synchronously between `await` points, and `expandNodeOnce`'s cache is
  populated synchronously before its search is dispatched - so two
  branches that reach the same node always resolve to the same cached
  dispatch, never two.
- The result (`{ tree, nodes, edges, diagnostics }`) carries a nested
  `tree` for display and flat, already-deduplicated Cytoscape-shaped
  `nodes`/`edges` that feed straight into `loadGraphSnapshot` via the
  "Load onto canvas" action - the same reducer action the Import feature
  uses (see above), so a query result is loaded exactly like an imported
  snapshot: it replaces the graph and carries no expansion parent/child
  link.
- Gated by the `enable_graph_query` setting (`[features]` stanza, same
  capability/permission boundary as the templates it calls - see
  CONFIGURATION.md). See KNOWN_LIMITATIONS.md for the grammar's
  restrictions.

## Multi-select, the time slicer, style overrides, saved views and the Graph/Table toggle

Five smaller additions, all client-side, each introducing no new SPL
shape (the first three and the last run no search of their own at all;
"saved views" only ever reuses `buildExpandNodeSpl`):

- **The Graph/Table toggle.** Two buttons in the toolbar, each with a
  `@splunk/react-icons` glyph (`ChartLinkGraph`, `Table`) alongside its
  label (`GraphToolbar.jsx`'s `viewMode`/`onViewModeChange`), switch
  `RelationshipExplorer/App.jsx`'s `canvasViewMode` state between
  `'graph'` (the existing `GraphCanvas`) and `'table'`
  (`GraphTableView.jsx`, two plain HTML tables - Nodes, Relationships).
  Both read the identical `renderable.nodes`/`renderable.edges` - the
  same already-filtered data the canvas itself renders - so the two
  views can never disagree about what counts as "in" the graph right
  now. Switching away from Graph unmounts `GraphCanvas` (destroying its
  Cytoscape instance) rather than merely hiding it, both to avoid
  running a layout against a zero-size hidden container and to keep the
  two views' DOM entirely separate; `App.jsx` clears its own `cyRef` at
  the same time so every `cyRef.current`-dependent action (legend
  click-to-select, Fit to screen, Centre selected, PNG export) sees "no
  canvas" instead of a stale handle to a destroyed instance - the
  toolbar also disables the layout-specific buttons outright while in
  Table view. The table view is read-only: selecting, expanding, pinning
  etc. remain canvas-only actions. Since 1.12.0 every other toolbar
  control also carries a `@splunk/react-icons` glyph alongside its
  label or option text: `EntitySearch`'s Search button (`Magnifier`),
  `TimeRangeSelector`'s preset options (`Clock`), `GraphToolbar`'s
  layout options (`Layout`), Recalculate layout (`ArrowClockwise`), Fit
  to screen (`ArrowsFourCorners`), Centre selected (`NodesCentered`),
  Reset graph (`TrashCanCross`), Import (`ArrowCircleInRight`),
  Export (`ArrowCircleOutRight`) and, since 1.17.0, Load from job
  (`MagnifierClock`) - purely cosmetic, no behaviour change.
- **Multi-select and bulk actions.** `GraphCanvas.jsx` leaves
  `boxSelectionEnabled` off by default (so ordinary click-and-drag still
  pans, as every earlier version of the app has) and toggles it on only
  while Shift is held - the conventional rubber-band-select modifier. A
  `select`/`unselect` listener (scoped to `'node'`) reports Cytoscape's
  own `:selected` collection to React whenever it changes; a legend
  click (`GraphCanvas.selectNodesByType`) populates the same collection
  by filtering nodes by their `type` data field (never a selector string
  built from that value). `RelationshipExplorer/App.jsx` shows
  `BulkActionsPanel` instead of the usual node/edge details whenever that
  collection holds more than one node, and every bulk action (pin,
  unpin, hide, expand) is the identical single-node action already used
  elsewhere, just looped - never a new code path.
- **The time slicer.** `TimeSlicer.jsx` adds two new optional keys to the
  same generic `activeFilters` bag `RiskFilter` already writes into
  (`timeFilterMin`/`timeFilterMax`, epoch ms) and
  `graphStateReducer.js`'s `selectRenderableElements` hides any node/edge
  whose `[firstSeen, lastSeen]` span does not overlap that window - an
  element with no parseable time data of its own is never hidden by it.
  Exactly like the Risk filter, this only ever hides what has already
  been fetched; it never changes what the toolbar's time range causes to
  be searched.
- **Session-only style overrides.** `StyleOverridesPanel.jsx` keeps a
  plain `{type: colour}` map in React state only - never written to KV
  Store, never to browser storage, gone on reload. `App.jsx` merges it
  over the curated per-type colour before computing
  `nodeColorByType`/`relationshipColorByType`, the same single source of
  truth the legend/filter swatches and the canvas itself already share
  (see the 1.6.0 colour-consistency fix above), so an override is never
  visible in only one of those places.
- **Saved views.** `savedViewsService.js` stores a named "recipe" - which
  single node a graph started from (`setInitialNode`) and which of its
  neighbours were expanded, in order - in the `graphlens_saved_views` KV
  Store collection (see collections.conf), not a frozen snapshot of node/
  edge data the way Export/Import is. Loading one re-dispatches
  `buildExpandNodeSpl` for the starting node, then for each recorded
  expansion in order, showing current data for the same nodes rather than
  resurrecting stale values. Saving only works for a graph that has
  exactly one node with no expansion-parent link (`findSingleRootNodeId`)
  - a graph built via Import or the query panel's "Load onto canvas" can
    start from several nodes at once and has no single node this
    schema's `initial_node_id` column could name; see
    KNOWN_LIMITATIONS.md. The replay itself is built by composing
    `graphStateReducer.js`'s own pure `setInitialNode`/`mergeExpansion`
    functions directly (each expansion step needs the previous one's node
    to already be visible, which React's batched, asynchronous state
    updates cannot guarantee mid-loop) and committed in one
    `actions.replaceState` call at the end - a narrow escape hatch added
    to `useGraphState.js` specifically for this, not for ordinary use.
    Private to the current user in this release: every write sets
    `sharing="private"` and `owner` to the current username, and every
    read filters to it - a UI convention, not a hard access-control
    boundary, the same as the audit log's precedent (see SECURITY.md).

## How "Load demo data" works

The Configuration page's "Load demo data" button (`demoDataService.js`)
automates the manual steps DATA_INGESTION.md/INSTALL.md already document,
rather than inventing a new one. Every value it sends is either a fixed
literal or an administrator-configured setting validated exactly the way
`relationship_index`/`relationship_lookup` already are elsewhere in this
module (`safeIndexNameOrFallback`/`safeLookupNameOrFallback`) - nothing
here accepts end-user input.

- **Type lookups**: dispatches the exact two `| inputlookup ... |
  outputlookup ...` lines DATA_INGESTION.md's section 3 already tells
  administrators to paste in by hand (`splTemplates.js`'s
  `buildSeedNodeTypesSpl`/`buildSeedRelationshipTypesSpl` - zero dynamic
  tokens).
- **Sample relationships, lookup mode**: the same `| inputlookup
  graphlens_sample_relationships | outputlookup <configured lookup>`
  shape, with only the already-validated lookup name as a token
  (`buildSeedRelationshipsLookupSpl`).
- **Sample relationships, index mode**: `buildSeedRelationshipsIndexSpl`
  uses `| collect` to write the looked-up rows into the configured index
  as real events. Two designs were tried and rejected first, both
  confirmed against a live instance rather than assumed:
  - Posting the sample data as raw CSV text to Splunk's `receivers/simple`
    REST endpoint (matching how a real file upload is ingested) seemed
    like the obvious way to get the target sourcetype's own index-time
    `INDEXED_EXTRACTIONS = csv` (default/props.conf) to apply the same way
    it does for a real file. It does not: a multi-line POST to that
    endpoint does not reliably line-break into one event per row the way
    a monitored file does (confirmed live - 39 rows in, 2 events out), and
    even a single well-formed event posted this way was not reliably
    found afterwards either.
  - `| collect` directly into `graphlens:relationship` was tried next and
    also rejected: that stanza's `KV_MODE = none` (it relies on
    `INDEXED_EXTRACTIONS = csv` instead, which never applies to
    `collect`'s own output) suppresses the ordinary automatic key=value
    extraction `collect`'s output format depends on, so none of the
    fields would become searchable - also confirmed live, not assumed
    from the first rejection's reasoning alone.
  - The working design: `| collect` into a *dedicated*
    `graphlens:relationship:demo` sourcetype (default/props.conf,
    `KV_MODE = auto`, deliberately no `TIMESTAMP_FIELDS` - see that
    stanza's own comment for why) instead of `graphlens:relationship`
    itself. `collect`'s key="value" output format is then extracted
    correctly by ordinary automatic KV extraction, confirmed live (all 39
    rows, every field, including a `source_id`/`target_id` search for
    "jsmith"). The live search templates above never filter by
    sourcetype (only by index), so these demo events are found
    transparently alongside everything else once loaded - nothing in
    `buildRelationshipSourceLines`/`buildExpandNodeSpl`/etc. needed to
    change.

Each bundled sample row's `source_index`/`source_sourcetype` columns are
rewritten at load time to the administrator's actually-configured index
(rather than the sample CSV's literal default), so "View supporting
events" resolves correctly for the demo data even when that setting has
been changed from its default - `buildEvidenceSpl` always reads
`source_index`/`source_sourcetype` from the row itself, regardless of
`relationship_source_type` (see "How searches retrieve relationships"
above).

## How permissions are enforced

See SECURITY.md, "Access control". In summary: Splunk's own role-based
access control on search dispatch and KV Store REST calls is the
authority; GraphLens's `capabilityService.js` only hides/disables UI
controls a user's capabilities don't grant, as a convenience.

## Directory layout

```
graphlens/
├── app.manifest
├── default/                 Splunk configuration (conf files, views, nav)
├── metadata/                default.meta ACLs
├── lookups/                 CSV seed data for node/relationship type config
├── static/                  Splunkbase icons/logo
├── appserver/
│   ├── templates/           Mako view shells (no Python code blocks)
│   └── static/build/        Compiled JS/CSS (generated by `npm run build`)
├── src/main/webapp/
│   ├── shared/               Framework-agnostic services + React hooks
│   │   ├── services/         searchService, kvStoreService, auditService,
│   │   │                     configService, capabilityService,
│   │   │                     graphTransformer, graphStateReducer,
│   │   │                     pathFinder, exportService,
│   │   │                     evidenceQueryBuilder, typeConfigService,
│   │   │                     demoDataService
│   │   ├── hooks/             useGraphState
│   │   ├── models/            graphModel (state shape, constants)
│   │   ├── components/        PageNav (in-app nav - see KNOWN_LIMITATIONS.md,
│   │   │                     "No Splunk Web chrome around type=html views")
│   │   └── utilities/         splSafety, restClient
│   └── pages/
│       ├── RelationshipExplorer/   Main graph explorer page
│       ├── ConfigurationPage/      Admin configuration page
│       ├── HealthPage/             Health/audit summary page
│       └── HelpPage/               Static in-app user guide
├── sample_data/              Synthetic sample CSVs (see scripts/generate_sample_data.py)
├── scripts/                  Icon/sample-data generators, packaging script
└── tests/                    unit/, security/, performance/
```
