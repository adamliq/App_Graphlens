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
  exportService, splSafety
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
| `graphlens_graph_statistics` (saved search) | Aggregate counts for limit/health reporting |
| `graphlens_health` (saved search) | Recent audited actions, for the Health page |

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

Each page (`RelationshipExplorer`, `ConfigurationPage`, `HealthPage`) is a
small React application built with `@splunk/react-ui` components, entered
through `src/main/webapp/pages/<Page>/index.jsx`, compiled by webpack into
`appserver/static/build/pages/<Page>/App.js` + `App.css`. A thin Mako view
(`default/data/ui/views/<name>.xml` -> `appserver/templates/<Page>.html`)
provides the page shell inside Splunk Web's standard chrome (navigation,
header) and loads the compiled bundle by `<script src="${make_url(...)}">`
- the templates intentionally contain **no Mako Python code blocks**
(`<% %>` / `<%! %>`), only `<%inherit>`/`<%block>` directives and `${}`
expressions, because Splunk AppInspect's `check_for_existence_of_python_code_block_in_mako_template`
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
│   │   │                     evidenceQueryBuilder, typeConfigService
│   │   ├── hooks/             useGraphState
│   │   ├── models/            graphModel (state shape, constants)
│   │   └── utilities/         splSafety, restClient
│   └── pages/
│       ├── RelationshipExplorer/   Main graph explorer page
│       ├── ConfigurationPage/      Admin configuration page
│       └── HealthPage/             Health/audit summary page
├── sample_data/              Synthetic sample CSVs (see scripts/generate_sample_data.py)
├── scripts/                  Icon/sample-data generators, packaging script
└── tests/                    unit/, security/, performance/
```
