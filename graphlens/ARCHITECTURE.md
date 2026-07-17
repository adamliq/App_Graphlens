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
- **Hybrid**: `graphlens_node_details` and `graphlens_expand_node` join
  indexed relationship data with curated KV Store metadata via `| lookup`
  (see `default/savedsearches.conf` and `default/transforms.conf`), so the
  graph the user sees is a merge of observed and curated data without the
  browser needing to know which source contributed which field.

## How searches retrieve relationships

Every search the browser can trigger is a named, pre-defined saved search
in `default/savedsearches.conf`, dispatched with validated
`args.<token>=<value>` substitutions - never raw SPL. See SECURITY.md for
the full injection-prevention discussion. The searches are:

| Saved search | Purpose |
|---|---|
| `graphlens_initial_entity_search` | Locate candidate entities for the entity search box |
| `graphlens_expand_node` | One-hop expansion of a single node |
| `graphlens_node_details` | Aggregated node properties + curated metadata |
| `graphlens_edge_details` | Aggregated edge properties |
| `graphlens_evidence_search` | Bounded supporting-event retrieval for a node or edge |
| `graphlens_graph_statistics` | Aggregate counts for limit/health reporting |
| `graphlens_cluster_expand` | Optional bounded expansion of a collapsed cluster/group node |
| `graphlens_health` | Recent audited actions, for the Health page |

`searchService.js` dispatches these via Splunk's documented
`services/saved/searches/<name>/dispatch` REST endpoint, polls
`services/search/jobs/<sid>` until `dispatchState=DONE` (with exponential
backoff and a configurable timeout), reads results from
`services/search/jobs/<sid>/results`, and can cancel an in-flight or
abandoned job via `services/search/jobs/<sid>/control`.

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
  `graphlens_expand_node`, transform the result rows into Cytoscape
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
