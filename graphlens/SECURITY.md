# Security

GraphLens is designed secure-by-default: Splunk remains the sole
authentication, authorisation, search-execution, and data-storage
boundary. GraphLens adds no external credential store and no external
network dependency - every backend interaction goes through Splunk's own,
already-audited REST APIs (`services/search/jobs`,
`services/storage/collections/data/*`, `services/properties/*`,
`services/authentication/current-context`). The one piece of server-side
code GraphLens ships is the optional, disabled-by-default RBAC model
collector (`bin/graphlens_rbac_collector.py`) - see "RBAC model collector"
below, which is also the app's only component that runs with elevated
(system-user) privilege rather than the requesting user's own session.

## Reporting a vulnerability

Email `<SECURITY_CONTACT_EMAIL>` (replace this placeholder before
Splunkbase submission) with a description, reproduction steps, and impact
assessment. Please do not open a public issue for undisclosed
vulnerabilities. We aim to acknowledge reports within 5 business days.

## Input validation and SPL injection prevention

All user-controlled values pass through
`src/main/webapp/shared/utilities/splSafety.js` before they are ever used
in a search:

- **Node/edge identifiers** must match `ID_PATTERN`
  (`^[A-Za-z0-9][A-Za-z0-9:_\-.@/]{0,254}$`) - no quotes, backslashes,
  pipes, wildcards, spaces or control characters are permitted. Enforced
  both client-side (`assertValidId`) and again server-side by the
  `graphlens_valid_id` macro in `default/macros.conf`.
- **Type tokens** (node type, relationship type, layout name, export
  format) are checked against `TYPE_TOKEN_PATTERN` and/or an explicit
  allowlist (`assertAllowlisted`), never accepted as free text.
- **Free-text search terms** (the entity search box) are cleaned to a
  conservative character set and then escaped for safe embedding in a
  quoted SPL string literal (`sanitizeSearchTerm` /
  `escapeSplStringLiteral`) - see `tests/security/injection.test.js` for
  the exact payload set this is tested against (quote injection, pipe
  injection, backtick/subsearch injection, newline injection, wildcard
  injection, oversized input, NUL bytes).
- **Index and sourcetype names** used unquoted in the evidence search
  (`index=$token$ sourcetype=$token$`) are validated against
  `INDEX_NAME_PATTERN` / `SOURCETYPE_PATTERN` with a safe fallback
  (`safeIndexNameOrFallback`, `safeSourcetypeOrFallback`) even though they
  originate from Splunk's own search results, not raw user input - see
  `evidenceQueryBuilder.js` for why this extra layer exists (defence
  against a compromised/malformed upstream log source, not just the UI
  user).
- **The relationship index/lookup name** embedded as the generating clause
  of every relationship-reading template (`search index="<index>"` or
  `| inputlookup <lookup>`) is likewise validated before being spliced in
  unquoted - `safeIndexNameOrFallback` against `INDEX_NAME_PATTERN` for
  index mode, `safeLookupNameOrFallback` against the equally strict
  `LOOKUP_NAME_PATTERN` (`^[A-Za-z0-9_-]{1,80}$`) for lookup mode - even
  though both values come from admin-only configuration
  (`graphlens_settings.conf`, gated by `graphlens_manage_config`), not
  direct user input, for the same defence-in-depth reason as the index/
  sourcetype validation above.
- **Numeric limits** (expansion size, path depth, result counts) are
  coerced and clamped with `clampInteger`, which returns a plain
  JavaScript number - never the original string - so trailing
  metacharacters in a numeric-looking input can never reach SPL.
- Time range tokens are restricted to a fixed set of presets
  (`TimeRangeSelector.jsx`) and additionally validated by
  `assertValidTimeLiteral` if ever accepted from another source. Time
  bounding itself is done exclusively through the `dispatch.earliest_time`
  / `dispatch.latest_time` REST parameters, never through a token
  substituted into the SPL text - see the comment block at the top of
  `default/savedsearches.conf`.
- Every controlled search in `default/savedsearches.conf` also applies a
  `| head <limit>` and a `dispatch.max_time`, so even a search that somehow
  matched more than intended cannot return unbounded results or run
  unbounded.

Nothing in GraphLens ever concatenates untrusted input directly into an
SPL string outside of these validated/escaped token substitutions, and no
component accepts arbitrary user-supplied SPL.

## The query language introduces no new SPL injection surface

The Relationship Explorer's text query panel
(`graphQueryLanguage.js`/`graphQueryExecutor.js`, see ARCHITECTURE.md) is a
GraphQL-like syntax a user can type free text into, which makes it worth
stating explicitly: **nothing in it ever builds a new SPL string from
query input.** The executor resolves every query exclusively through the
same two templates and the same validated argument pipeline described
above:

- A query's `search` argument is passed through `sanitizeSearchTerm` and
  `buildInitialEntitySearchSpl` - the identical function and validation
  the entity search box itself calls.
- A query's `id` argument is passed through `isValidId` and
  `buildExpandNodeSpl` - the identical function and validation node
  expansion itself calls.
- A relationship field's name, its optional `type` argument, and its
  `direction` argument are never spliced into SPL at all. They are matched
  client-side (string comparison) against the `relationship_type`,
  `source_id` and `target_id` fields of rows one of the two searches above
  already returned - the same technique the existing
  `hiddenRelationshipTypes` filter uses elsewhere in the app.
- A relationship field's `limit` argument only ever flows into
  `clampInteger`, the same numeric-coercion helper used for every other
  limit in the app (see above) - never into string interpolation.

Put differently: parsing a query can reject it (a syntax error, an unknown
field, an invalid `direction`, nesting deeper than
`settings.maxExpansionDepth`), but nothing a query's text contains is ever
capable of changing *which* SPL template runs or *how* it is built - only
*how many times* `buildExpandNodeSpl` is dispatched (bounded by
`MAX_QUERY_EXPANSIONS` and ancestor-path cycle detection; see
ARCHITECTURE.md) and which already-fetched rows are kept client-side.
`tests/unit/graphQueryExecutor.test.js` includes a dedicated case
confirming a crafted `id` argument is rejected by the existing identifier
validator without ever reaching `dispatch`.

## Cross-site scripting (XSS) prevention

- React's default JSX text rendering HTML-escapes all dynamic text
  content; GraphLens does not use `dangerouslySetInnerHTML` anywhere.
- Node/edge labels and descriptions are additionally HTML-escaped at the
  data layer, in `graphTransformer.js`, the moment a search result is
  turned into graph state - before any component ever sees them. This
  means even a value that later gets serialised into an export, a
  tooltip, or a non-React string context is already safe.
- `escapeHtml` in `splSafety.js` is available for the rare case content is
  rendered outside of React's default escaping.
- CSV export cells are separately defanged against formula-injection
  payloads (`sanitizeForExportCell` - a leading `=`, `+`, `-`, `@` or tab
  is prefixed with a single quote, per OWASP CSV-injection guidance) since
  spreadsheet formula injection is a distinct risk from HTML injection.
- See `tests/security/xss.test.js` for the payload set this is tested
  against.

## Import file handling

The toolbar **Import** button (`importService.js`) reads a user-selected
file entirely client-side via the browser's `FileReader` API - it is
never uploaded to Splunk or anywhere else, and GraphLens has no server-side
component that could receive it even if it tried. The file's content is
treated as fully untrusted, exactly like a Splunk search result, whichever
of its two accepted shapes it turns out to be:

- A previously-exported **GraphLens JSON** file (`parseImportedGraphJson`)
  - malformed JSON, or JSON missing the expected `{ nodes: [...], edges:
    [...] }` shape, is rejected with a user-facing error before anything
    is touched.
- A **CSV** file shaped to the relationship schema (`parseImportedGraphCsv`,
  1.18.0) - the same schema an index, lookup, saved search, Table
  Dataset or "Load from job" already produces. Parsed with a small,
  dependency-free RFC4180-ish tokenizer (handles quoted fields, embedded
  commas/newlines, doubled-quote escaping); each resulting row is then
  classified by `jobResultsService.js`'s `classifyJobResultRows` -
  reusing the exact same row-classification "Load from job" already
  uses, rather than a third bespoke mapping - into node rows
  (`node_id`) and edge rows (`source_id`+`target_id`+
  `relationship_type`). A row matching neither shape is silently
  dropped; a file where no row matches either shape is rejected with a
  user-facing error before anything is touched. Format is detected by
  file extension, falling back to content (GraphLens's own JSON export
  always starts with `{`) for a file extension that matches neither.
- Either way, every resulting node/edge row is then converted to the
  same raw "row" shape a search result arrives in and run through
  `graphTransformer.transformRowsToGraph` - the same validation, escaping,
  deduplication and `maxVisibleNodes`/`maxVisibleEdges` enforcement a live
  search's results go through. An invalid identifier is dropped, not
  imported; a label is HTML-escaped the same way (see `tests/security/
  xss.test.js`'s import-pipeline cases, one per format). An import can
  never cause GraphLens to accept or display anything it would not
  otherwise accept from a search.
- Import is gated by the same `enableExport` feature flag as Export (no
  separate setting or capability) - they are presented as one
  import/export feature, and the graph limits/validation above are the
  actual boundary in either direction, not a capability check.
- Audited the same way as other graph actions (`import_graph` in
  `graphlens_audit_log`), including on failure (malformed file, rejected
  rows), with the node/edge counts and detected format only - never the
  file's raw content.
- The CSV shape accepted here is deliberately **not** the shape
  `exportNodesAsCsv`/`exportEdgesAsCsv` write (different column names,
  two separate files for one graph) - that export pair remains one-way;
  see USER_GUIDE.md.

## Load from job handling

The toolbar **Load from job** button (1.17.0) is the live-search
counterpart to Import above: instead of reading a user-selected file, it
reads the results of a Splunk search job that already exists, identified
only by its job id (sid) - one the current user dispatched themselves, or
one shared with them, in Splunk Web's own Search app or anywhere else.

- It does not, and cannot, dispatch a new search or grant access to a job
  the current user could not already see. `searchService.js`'s
  `attachToJob` reuses the exact same poll/results/cancel machinery
  `dispatchSavedSearch`/`dispatchAdHocSearch` already use, skipping only
  the "start a new job" step - the status and results REST endpoints it
  then calls (`/services/search/jobs/<sid>` and `.../results`) enforce
  Splunk's own job-level sharing ACL exactly as they would for any other
  REST caller. This is the same "UI convenience, not the security
  boundary" pattern used throughout this app (see "Saved search as a
  relationship data source" below for the lookup/saved-search/dataset
  analogue).
- A job's results are treated as fully untrusted, exactly like Import's
  file content or a live search's own results: `jobResultsService.js`'s
  `classifyJobResultRows` inspects each raw row's own fields to split
  them into node rows / edge rows (a job might hold a one-hop expansion's
  edge rows, a plain entity list's node rows, or a mix of both), silently
  dropping and counting any row matching neither shape. The classified
  rows are then run through the same `graphTransformer.transformRowsToGraph`
  validation, escaping, deduplication and `maxVisibleNodes`/
  `maxVisibleEdges` enforcement every other relationship source goes
  through - a job's results can never cause GraphLens to accept or
  display anything a live search's results would not otherwise accept.
- Gated by the same `enableExport` feature flag as Import/Export (no
  separate setting or capability) - it is thematically a sibling "bring
  external data onto canvas" action, and the graph limits/validation
  above are the actual boundary, not a capability check.
- A job is not a persistent relationship data source the way
  index/lookup/saved_search/dataset are (see "Saved search as a
  relationship data source" below): a job's results are themselves
  ephemeral, expired by Splunk on its own TTL once the job finishes
  unless it has been pinned or scheduled, so this is a one-time action
  only, never a `relationship_source_type` value.
- Audited the same way as Import (`load_from_job` in
  `graphlens_audit_log`), including on failure (invalid job id, job not
  found/expired/failed, rows not matching the relationship schema), with
  the job id and node/edge counts only - never the job's raw result
  content.

## Editing graph data

Two related features, both new in 1.19.0 and both gated by the new
`graphlens_edit_graph_data` capability: the Details panel's **Edit**
button (`NodeDetailsPanel.jsx`/`EdgeDetailsPanel.jsx`) for a node/edge
already on the canvas, and the pre-import **CSV table editor**
(`CsvImportPreviewDialog.jsx`) that a CSV import now opens instead of
loading straight onto the canvas.

- **An honest caveat, unlike every other capability in this app**: there
  is no server-side REST call behind either feature to enforce this
  capability against. An edit changes only the current session's
  in-memory graph state (`visibleNodes`/`visibleEdges` in React state) -
  nothing is written to Splunk, to KV Store, or anywhere else, so there
  is no request for a REST endpoint to reject. `graphlens_edit_graph_data`
  is therefore a **UI convenience, not an enforced security boundary**:
  a user who can reach the browser's developer tools could, in
  principle, call the same internal functions this capability is meant
  to gate. This is explicitly accepted, not an oversight, because of
  what editing can and cannot do:
  - It cannot show a user data their own search permissions did not
    already surface - editing only changes the display of a node/edge
    that is already visible to them, the same way a session-only colour
    override already does (1.9.0) without any capability at all.
  - It cannot affect what any other user sees - edits are this one
    session's own React state, never broadcast, never persisted (see
    below).
  - It cannot widen what GraphLens itself trusts - it adds no new SPL
    template, no new REST call, no new relationship data source.
  Compare this with every *other* capability in this app
  (`graphlens_manage_config`, `graphlens_use_search_source`, ...), each
  of which gates an actual Splunk REST write/read that enforces it
  independently of the UI. `graphlens_edit_graph_data` exists anyway -
  rather than leaving editing ungated the way style overrides are -
  because unlike a colour, a node/edge's own fields (label, risk score,
  relationship type, ...) are exactly what an analyst might otherwise
  rely on as if they came from the search itself, so hiding the
  capability from a role that should not be encouraged to hand-edit
  investigative data is still a meaningful UI convenience, even without
  a server-side backstop.
- **Session-only, same as the per-type colour overrides (1.9.0)**: an
  edit lasts until Reset graph, a reload, or the edited node/edge is
  dropped by a subsequent action (e.g. collapsing its parent). It is
  never written anywhere; re-export (CSV/JSON) afterward to keep the
  corrected data as a file.
- **Every edited value is sanitised exactly as a fresh row would be**:
  `graphTransformer.js`'s new `sanitizeNodeEdit`/`sanitizeEdgeEdit`
  reuse the exact same label-escaping (`escapeHtml`), risk-score-clamping
  (0-100) and event-count-clamping logic `transformRowsToGraph`'s own
  `upsertNode`/`upsertEdge` already apply to every other admission path -
  a hand-typed edit can never introduce markup or an out-of-range value
  a live search result could not already produce (see `tests/security/
  xss.test.js`'s edit-mode cases). `id`/`source`/`target` are never
  editable fields - changing them would just be creating a different
  node/edge under a confusing guise, not editing this one.
- **The CSV table editor edits rows, not files**: `CsvImportPreviewDialog.jsx`
  shows the CSV's own parsed rows (via `importService.js`'s new
  `parseCsvRowObjects`, the same tokenizer `parseImportedGraphCsv`
  already uses, split from its classification step) in an editable HTML
  table, bounded to the first 200 rows for the same reason every other
  view in this app is bounded - an unbounded inline-editable table would
  be unusable, not just slow. Rows beyond that limit still load, just
  unedited. On Load, the (possibly edited) rows are classified by
  `jobResultsService.js`'s `classifyJobResultRows` - the same function
  "Load from job" already uses - so an edited CSV import behaves
  identically to an unedited one, or to a job's results, from that point
  on. Without `graphlens_edit_graph_data`, CSV import behaves exactly as
  it did in 1.18.0: straight to the canvas, no preview step.
- Audited the same way as other graph actions (`edit_node`/`edit_edge`
  in `graphlens_audit_log`), with the node/edge id only - never the
  edited values themselves.
- **Undoing the single most recent edit (1.21.0)** carries the same
  trust characteristics as the edit it reverts: `EditUndoNotification.jsx`'s
  Undo button restores a node/edge's data to exactly what was captured
  just before the edit it is undoing, through the same
  `updateNodeData`/`updateEdgeData` reducer action the edit itself used
  - no new write path, no new capability, and still gated by
  `graphlens_edit_graph_data` only in the sense that there is nothing to
  undo unless an edit happened in the first place. Like the edit itself,
  it is session-only and never persisted; only the single most recent
  edit can be undone (a second edit, or dismissing the banner, discards
  the snapshot), and it is discarded outright by any action that
  replaces the whole graph (Reset graph, Import, Load from job), since
  restoring a stale snapshot into an unrelated new graph that happens to
  reuse the same id could otherwise silently corrupt it.

## Multi-select, the time slicer, style overrides and saved views

- **Multi-select and bulk actions** run no search of their own at all -
  box/lasso-select and the legend's "select this type" both only change
  which already-visible Cytoscape elements are selected, and every bulk
  action (pin, unpin, hide, expand) dispatches exactly the same already-
  reviewed path the single-node version of that action already uses, just
  once per selected node.
- **The right-click context menu (1.20.0, extended to edges in 1.21.0)**
  adds no new action and no new capability: every item it offers
  (Expand/Collapse, Pin/Unpin, Hide, Centre on screen, View supporting
  events, Use as path endpoint for a node; View supporting events alone
  for an edge) dispatches the exact same handler the details panel's
  own button for that action already uses, and every one of those
  actions is already available to any viewer-tier user with no
  capability check of its own. The menu itself is purely a UI
  convenience (a `@splunk/react-ui` Popover anchored to the canvas) with
  no search or state of its own beyond which element it is currently
  showing for.
- **The confirm-before-discard guard (1.21.0)** in front of Reset graph,
  Import and opening Load from job runs no search and writes nothing -
  it is a plain `@splunk/react-ui` Modal (`ConfirmDialog.jsx`) that
  either calls the already-reviewed action the user asked for, or does
  not, with no third path. It only ever appears when the canvas
  currently has at least one node (`nodeCount > 0`); an empty canvas
  skips it entirely, since there is nothing it could lose.
- **The time slicer** is a pure client-side filter over data already
  fetched (see ARCHITECTURE.md) - identical in kind to the existing Risk
  filter, just filtering on `firstSeen`/`lastSeen` instead of risk score.
  It never changes what is searched or dispatches anything of its own.
- **Session-only style overrides** are kept in React state alone - never
  written to KV Store, never to browser storage, and never sent to
  Splunk or anywhere else. They cannot affect any other user's session
  and do not survive a reload; they also never change the *curated*
  per-type colours an administrator maintains in
  `graphlens_node_types`/`graphlens_relationship_types`, only how this one
  browser tab currently renders them.
- **Saved views** write to the `graphlens_saved_views` KV Store
  collection through the same generic, already-reviewed
  `kvStoreService.js` used elsewhere (`storage/collections/data`, subject
  to the collection's own ACL - see `kvStoreService.js`'s header comment).
  Every write stores `owner` as the current username and `sharing` as
  `"private"`; every read filters to the current username
  (`listSavedViews`). As with the audit log, **this is a UI convention,
  not a hard access-control boundary** - Splunk's own KV Store ACL on the
  collection is the actual authority, not this filtering. Loading a saved
  view never constructs new SPL: it validates the stored `initial_node_id`
  and each stored expanded-node id with the same `isValidId` check live
  expansion already uses, then dispatches the same `buildExpandNodeSpl`
  template, once per node, exactly as a live exploration session would.
  An invalid or no-longer-resolvable id is skipped (an expansion id) or
  surfaces a clear error (the starting node), never passed into a search.

## Access control

GraphLens uses native Splunk capabilities, never client-side role-name
checks, as the authority (`default/authorize.conf`):

| Capability | Grants |
|---|---|
| `graphlens_run_search` | Dispatch GraphLens's controlled searches |
| `graphlens_view_evidence` | Run the evidence/supporting-event search |
| `graphlens_export_graph` | Export the currently visible graph |
| `graphlens_create_annotation` | Create annotations |
| `graphlens_manage_shared_annotation` | Edit/delete shared annotations |
| `graphlens_save_view` | Save a graph view |
| `graphlens_manage_shared_view` | Manage shared saved views |
| `graphlens_manage_config` | Edit `graphlens_settings.conf` |
| `graphlens_manage_collections` | Curate node/edge/type KV Store data; also gates the Configuration page's "Load demo data" button (see ARCHITECTURE.md) |
| `graphlens_view_health` | View the Health page and audit log |
| `graphlens_use_search_source` | Set the Configuration page's Relationship data source to Saved search or Table Dataset, and change which one it names - see "Saved search as a relationship data source" below. Not granted to any example role by default |
| `graphlens_edit_graph_data` | Edit a node/edge's own properties on canvas, and use the CSV table editor before an import - see "Editing graph data" below. A UI convenience only; there is no server-side write this one enforces against |

The React frontend calls
`src/main/webapp/shared/services/capabilityService.js` to hide/disable
controls a user's role does not grant - **this is a UI convenience, not
the security boundary.** The boundary is Splunk's own enforcement on each
underlying REST endpoint:

- Search dispatch is subject to normal search-time index/data permissions
  (`srchIndexesAllowed` etc.) - GraphLens cannot show a user data their
  role could not already see through `search`.
- KV Store collection access is enforced by `metadata/default.meta` ACLs,
  scoped to the `graphlens_viewer` / `graphlens_analyst` / `graphlens_admin`
  roles.
- Configuration writes to `graphlens_settings.conf` go through Splunk's
  standard `configs/conf-*` REST endpoint, gated by Splunk's built-in
  `admin_all_objects` capability by default. If you need finer-grained
  delegation than "full admin" for configuration writes, add a
  capability-scoped `restmap.conf` stanza for the `conf-graphlens_settings`
  endpoint and verify the exact syntax against the Splunk version you are
  deploying to - this is not shipped by default because the precise
  `restmap.conf` pattern for restricting a generic custom-conf endpoint
  has changed across Splunk versions and must be verified against current
  documentation for your target version before relying on it.
- "Load demo data" in index mode (see ARCHITECTURE.md) writes new events
  via a dispatched `| collect` search, using the current user's own
  session and normal search dispatch permissions - no HEC token, no
  credential of GraphLens's own, no new REST surface beyond search
  dispatch. Splunk enforces whatever write permission `collect` normally
  requires for the target index; GraphLens neither grants nor bypasses it.
  Every call this button makes - the type-lookup seeding, the
  relationship-data write, and the resulting audit log entry
  (`load_demo_data`, same KV Store write path as every other tracked
  action) - is also gated by `graphlens_manage_collections` in the UI, per
  the convention above.

### Known limitation: KV Store is collection-level, not row-level

Splunk KV Store access control (`metadata/default.meta`) is per
collection, not per document. A role granted write access to
`graphlens_annotations` or `graphlens_saved_views` (i.e. `graphlens_analyst`
and `graphlens_admin`) can technically write or delete *any* document in
that collection through the raw REST API, not only records it authored.
GraphLens's own UI only ever edits a user's own records (or, for admins,
records being managed on behalf of the team) and filters what it displays
by owner/sharing - but that is an application-level convention enforced in
the browser, not a Splunk-enforced boundary. Do not treat annotation or
saved-view "ownership" as a hard security control; treat it as a
UI-organisation feature. This is called out explicitly in
`metadata/default.meta` and tested for in
`tests/security/injection.test.js`'s sibling security-boundary tests (see
TESTING.md for the manual REST-level test procedure, which requires a live
Splunk instance and is not automatable in this repository's unit tests).

## Saved search as a relationship data source

`relationship_source_type = saved_search` and `= dataset`
(CONFIGURATION.md) are a third and fourth alternative to the Index and
Lookup modes that have existed since 1.0.0 - saved search added in 1.14.0,
Table Dataset in 1.16.0. They are the most trust-sensitive of the four,
which is why they are the only ones with their own dedicated capability
(`graphlens_use_search_source`, shared by both - see "Why one capability
covers both" below) rather than sharing `graphlens_manage_config` with
every other setting on the Configuration page:

- **GraphLens does not review the named saved search's or dataset's
  content, the same way it already does not review a configured lookup's
  content in Lookup mode.** Whoever can author or edit that saved search
  or Table Dataset effectively controls what relationship data appears in
  the graph for every GraphLens user, regardless of their own individual
  search permissions on whatever indexes it actually reads from.
- `| savedsearch "<name>"` and `| from datamodel:"<name>"` both run under
  the *current user's own session*, the same as every other search this
  app dispatches - neither escalates privilege or runs as the object's
  owner on its own. Both are themselves subject to normal Splunk
  search-time permissions for whichever user runs them.
- `graphlens_use_search_source` is deliberately **not granted to any
  example role in default/authorize.conf**, including
  `role_graphlens_admin` - an organisation adopting either of these
  features makes that choice explicitly (clone `role_graphlens_admin` and
  add `graphlens_use_search_source = enabled`), rather than inheriting it
  silently from an upgrade.
- Either source's own results must already be shaped to the relationship
  schema (DATA_MODEL.md) - GraphLens applies no transformation of its
  own, the same expectation Lookup mode already carries for a configured
  lookup's rows.
- The Configuration page's Load demo data button (added in 1.13.0) does
  not apply in either mode: see CONFIGURATION.md's "Demo data" section.

### Why `| from datamodel:`, not `| datamodel ... search`, for Table Dataset mode

A Table Dataset (Settings > Datasets > Create Table View) is itself
stored as a single-object data model under the hood - confirmed against a
live instance: Splunk Web's own Datasets listing query only recognises
`inputlookup-table`, `inputlookup-transform` and `datamodel` as dataset
`eai:type`s, with no separate "table dataset" type. `| datamodel "<name>"
search` was tried first and rejected after live testing: its output
fields come back prefixed with the model's object name (e.g. `Audit.user`,
not `user` - confirmed by inspecting a shipped data model's own
`objectSearch`), which would silently break every `source_id`/`target_id`/
etc. field this app expects. `| from datamodel:"<name>"` instead returns
flat, unprefixed field names - also confirmed live - so that is what
`relationship_dataset` is read with. One consequence: for a data model
with more than one object (an unusual shape for a genuine Table Dataset,
which is single-object by design, but possible for a hand-authored
multi-object data model), `| from datamodel:"<name>"` returns only one
object's rows, not all of them merged - point `relationship_dataset` at a
true single-table Table Dataset to avoid this ambiguity.

### Why one capability covers both

Saved search mode and Table Dataset mode carry the identical trust
characteristic described above - GraphLens trusting an administrator's
own authored content rather than reviewing it - so they share
`graphlens_use_search_source` rather than each getting its own capability.
Splitting them would not add any real additional control (an
administrator willing to grant one is, in practice, making the same trust
decision for the other) while fragmenting an already-narrow permission
into two near-identical ones purely by Splunk feature used to author the
content, not by the actual risk involved.

## RBAC model collector

`bin/graphlens_rbac_collector.py`, wired up (disabled by default) in
`default/inputs.conf`, is a scripted input that snapshots this Splunk
instance's own access-control structure - roles, capabilities, the indexes
each role can search, role inheritance, and (where SAML or LDAP is
configured) which identity-provider groups map to which roles - and writes
it as ordinary `graphlens_relationships` events, so it can be explored in
the Relationship Explorer like any other data. See RBAC_MODEL.md for the
full data model and setup.

This is a deliberate exception to the rest of GraphLens's design, and is
called out here for that reason:

- **It is the app's only server-side code.** Everything else in GraphLens
  is static frontend assets plus Splunk-native configuration; this is a
  Python scripted input that runs on the Splunk server itself.
- **It runs as a specific named account, not the requesting user's
  session, and that account needs real capability - there is no reserved
  "run as system" value.** `passAuth` (Splunk's own mechanism for giving a
  scripted input a session key) always names a real, existing user
  account; splunkd generates that user's session key and writes it to the
  script's stdin on every invocation. An earlier version of this app
  assumed `passAuth = splunk-system-user` worked as a universal
  reserved literal - **verified wrong against a live instance**: no such
  account exists on a default install, and the input silently produced no
  data. There is no default value in `default/inputs.conf` for this
  reason; an administrator must set `passAuth` to a real account when
  enabling it (see RBAC_MODEL.md, "Setup").
- **That account needs more than the requesting GraphLens user's own
  role could ever grant, but less than full admin.** Enumerating *all*
  roles' capabilities (not just your own role's) requires `edit_roles`;
  reading `authentication.conf` (for SAML/LDAP group mappings) requires
  `change_authentication`. Both were confirmed by testing against a live
  instance with a dedicated role holding only those two capabilities (no
  `admin_all_objects`) - the collector ran successfully end-to-end. Create
  a dedicated role/user with exactly `edit_roles` and
  `change_authentication` and nothing else, rather than pointing
  `passAuth` at your actual admin account - this is meaningfully less
  exposure than "admin-equivalent" if that account's session key were ever
  somehow captured.
- **The data it produces is itself sensitive.** A full role -> capability
  -> index map, plus which SAML/LDAP groups grant which roles, is
  effectively a blueprint of this instance's privilege structure and
  identity-provider group naming (which can itself leak organisational
  structure, e.g. `cn=domain-admins,ou=...`). Treat read access to wherever
  this data lands the same way you would treat read access to
  `authorize.conf`/`authentication.conf` themselves.
- **It is disabled by default** (`disabled = true` in `default/inputs.conf`)
  and writes to `graphlens_relationships` only if an administrator enables
  it and chooses to leave that setting as-is. Before enabling it, decide
  whether the analysts who already have `srchIndexesAllowed` access to
  `graphlens_relationships` should also see this data; if not, point
  `index =` at a separate index with its own, more restrictive
  `srchIndexesAllowed` scoping on the relevant roles - GraphLens has no
  in-app mechanism to filter index data below Splunk's own index-level
  access control, so index placement is the actual security boundary here,
  the same as for every other index GraphLens reads from.
- **It never stores credentials.** The session key is read once per
  invocation from stdin (supplied by splunkd itself, per Splunk's own
  `passAuth` mechanism) and is never written to disk, logged, or reused
  across runs.
- The SAML/LDAP group-to-role mapping this script relies on
  (`roleMap_<strategy>` stanzas in `authentication.conf`) is documented
  Splunk behaviour but was not checked against a live SAML/LDAP-configured
  instance before release - see RBAC_MODEL.md and KNOWN_LIMITATIONS.md.
  Verify it reports your actual group mappings correctly before relying on
  it, the same way every other previously-unverified Splunk-internals
  assumption in this app needed live verification before being trusted
  (see DEVELOPMENT.md).

## Secrets

GraphLens requires no external credentials by design - it only ever talks
to the Splunk instance it is installed in, using the current user's own
session. Consequently:

- No secrets, tokens, or passwords are stored in source code, in KV Store,
  or in any `.conf` file shipped by GraphLens.
- No secrets are ever returned to the browser beyond what Splunk's own
  session/CSRF cookies already provide (handled entirely by Splunk Web,
  not by GraphLens code).
- If a future integration ever required a credential, it must use
  Splunk's supported credential-storage mechanism (a `passwords.conf`
  entry accessed only from trusted server-side code) - GraphLens's current
  design has no server-side code at all, so this does not apply to 1.0.0.

## Content Security Policy

GraphLens is compatible with Splunk Cloud's CSP defaults:

- No inline `<script>` blocks, no `eval`, no `new Function`, no
  dynamically constructed `<script src>` pointing anywhere other than the
  app's own bundled, same-origin static assets.
- No remote stylesheets, remote scripts, or remote fonts - Cytoscape.js,
  React and @splunk/react-ui are all bundled into
  `appserver/static/build/` by the production webpack build; nothing is
  loaded from a CDN at runtime.
- No iframes.
- All network calls target the Splunk instance's own `splunkd` REST API
  through the same-origin path Splunk Web itself uses
  (`utilities/restClient.js`), never a cross-origin endpoint.

## Audit logging

Every tracked user action (search dispatch, expansion, collapse, evidence
view, export, import, graph query, annotation/view CRUD, configuration
change, graph-limit event, client error) is recorded in the
`graphlens_audit_log` KV Store collection by `services/auditService.js`,
with the actor, action, target identifiers and outcome only - never
credentials, tokens, or raw event content. A graph query's audit record
likewise only ever carries a node/edge count and a truncation flag, the
same as the entity search box's own audit record never carries the raw
search term typed into it - never the query text itself. See
ARCHITECTURE.md and ADMIN_GUIDE.md for how to review it.

## Third-party dependency security

See THIRDPARTY.md for the full inventory, licences, and the most recent
`npm audit` result. Dependency updates should re-run `npm audit` and this
document's "Vulnerability status" section as part of every release (see
DEVELOPMENT.md).
