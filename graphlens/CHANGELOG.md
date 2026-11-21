# Changelog

All notable changes to GraphLens are documented in this file.

## [1.6.5] - 2026-11-21

### Fixed

- **Node labels hardened with the same background as edge labels.** Node
  labels sit below the node on the plain canvas, not on the node's own
  fill, so they were never exposed to the per-type-colour contrast
  problem edge labels had (1.6.4) - but in a dense graph a curved edge
  can still pass directly under where a label lands, and nothing stopped
  that from eventually causing the same kind of illegibility. Gave node
  labels the identical canvas-coloured background
  (`text-background-color`/`-opacity`/`-shape`/`-padding`) - a no-op on
  the common case, since it already matches the plain canvas, confirmed
  live with the J Smith sample node: its own risk halo visibly passes
  under its label, and the label stays perfectly legible.
- Rechecked parallel edges while verifying this (the bundled sample data
  already has two: `AUTHENTICATED_TO` and `OWNS` both between the same
  two nodes) - Cytoscape's own "bundled bezier" curve style already fans
  these apart automatically, confirmed live that both labels render
  distinctly with no overlap. Nothing to fix there.

Version bumped to 1.6.5 (defensive hardening, requested as part of a
label readability/visibility recheck). Full npm test (300 tests) and
lint (0 warnings) pass; AppInspect re-run clean (0 errors/failures, same
7-warning profile as prior releases).

## [1.6.4] - 2026-11-21

### Fixed

- **Edge labels showed dark font on a dark edge line** - reported
  directly. Edge labels are drawn directly on top of the edge's own
  line, whose colour varies per relationship type (up to 19 colours,
  several fairly dark since 1.6.0's palette expansion), but the label
  used a single fixed dark colour (`#4a4a4a`) with no background -
  readable against a light line, close to illegible against a dark one.
  Fixed by giving every edge label a solid background matching the plain
  canvas colour (`text-background-color`/`-opacity`/`-shape`/`-padding`),
  so legibility no longer depends on guessing a label colour that
  contrasts with whatever colour the line underneath happens to be.
  Confirmed live against a relationship type deliberately chosen to hash
  to the darkest colour in the palette (`#9B277E`, luminance 0.099) -
  the label is now clearly legible, at every rotation and in every
  selection/path-highlight state (neither touches label styling, so both
  inherit the same fix).
- Checked node labels too: already unaffected, since `text-valign:
  bottom` positions them below the node on the plain canvas, never on a
  coloured shape.

Version bumped to 1.6.4 (bug fix only). Full npm test (300 tests) and
lint (0 warnings) pass; AppInspect re-run clean (0 errors/failures, same
7-warning profile as prior releases).

## [1.6.3] - 2026-11-21

### Fixed

- **Node/Edge details panels showed risk score as plain text**, even for
  a risk ≥ 70 node/edge, which has had a dedicated red halo on the
  canvas since 1.6.0 - the two places a user reads the same risk score
  disagreed on how much attention it deserved. Both panels
  (`NodeDetailsPanel.jsx`/`EdgeDetailsPanel.jsx`) now render a high risk
  score in the same red (`STATUS_COLORS.risk`) and bold, confirmed live.
- Rechecked colour/layout again on this pass: no further issues found
  against the bundled sample data.

Version bumped to 1.6.3 (bug fix only). Full npm test (300 tests) and
lint (0 warnings) pass; AppInspect re-run clean (0 errors/failures, same
7-warning profile as prior releases).

## [1.6.2] - 2026-11-21

### Fixed

- Rechecked layout/colour after 1.6.1, cycling through all five layouts
  (cose, concentric, breadthfirst, circle, grid) live against the bundled
  sample data. Four were already clean; **concentric** still showed
  residual crowding between an edge label and the node label directly
  below it on a small, low-degree-variance graph (its rings collapse
  close together in that case, and `minNodeSpacing`'s 10px default cushion
  wasn't enough even with `nodeDimensionsIncludeLabels` on). Bumped
  `minNodeSpacing` to 28px for the concentric layout only; confirmed live
  the crowding is reduced.
- No other layout or colour issues found on this pass - also re-confirmed
  Cytoscape's own resize handling is unaffected and unrelated page errors
  seen during verification are pre-existing Splunk Web platform noise
  (home-page cards/DMC/federated-analytics config polling during login),
  not GraphLens's own code.

Version bumped to 1.6.2 (bug fix only). Full npm test (300 tests) and
lint (0 warnings) pass; AppInspect re-run clean (0 errors/failures, same
7-warning profile as prior releases).

## [1.6.1] - 2026-11-21

### Fixed

- **Node/edge labels routinely overlapped each other** - every layout
  (cose, concentric, breadthfirst, circle, grid) defaults Cytoscape's
  `nodeDimensionsIncludeLabels` option to `false` (confirmed by reading
  Cytoscape's own layout source), so overlap-avoidance spacing only ever
  considered each node's own circle, never its label text below it -
  visible in earlier screenshots (e.g. a "Finance Admins" node label
  overlapping an adjacent "Authenticated to" edge label). Set
  `nodeDimensionsIncludeLabels: true` for all five layouts
  (`GraphCanvas.jsx`), confirmed live against the bundled sample data:
  labels are now clearly separated with no overlap, at both a 3-node and
  a 4-node graph size.
- Checked Cytoscape's own resize handling while auditing this (a
  `ResizeObserver` plus a window `resize` listener, both wired internally
  since recent Cytoscape core versions) - already correct, nothing to fix
  there.

Version bumped to 1.6.1 (bug fix only). Full npm test (300 tests) and
lint (0 warnings) pass; AppInspect re-run clean (0 errors/failures, same
7-warning profile as prior releases).

## [1.6.0] - 2026-11-21

### Fixed

- **Uncurated node/relationship types never actually rendered with
  per-type colours on the canvas at all** - every node/edge rendered the
  single flat default colour (`#5A2BE2`/`#9B9B9B`) regardless of type,
  confirmed live by sampling rendered pixel colours directly: four
  different sample-data node types (user, alert, host, group) all came
  back as the exact same `#5A2BE2`. Root cause: `graphTransformer.js` only
  ever set a node/edge's `color` field from curated KV Store config
  (`typeConfig.color`), never falling back to `colorForType()` the way the
  legend/filter swatches already did - so an uncurated install's legend
  promised per-type colours the canvas was not actually drawing. Fixed by
  computing collision-resolved `{type: color}` maps in
  `RelationshipExplorer/App.jsx` (from the same `deriveNodeTypeList`/
  `deriveRelationshipTypeList` the legend uses) and applying them to every
  node/edge passed to `GraphCanvas` - the legend and the canvas are now
  guaranteed to agree, by construction.
- **`colorForType()`'s 10-colour palette collided constantly** - computed
  directly: `user`, `group`, `ip`, `AUTHENTICATED_TO` and `OWNS` all hashed
  to the identical colour; `alert`, `host` and `MEMBER_OF` to another.
  Expanded to a 19-colour palette (`typeConfigService.js`) and added
  `resolveDistinctColors()`, a second deterministic pass
  `deriveNodeTypeList`/`deriveRelationshipTypeList` now run over whatever
  types are actually visible at once, reassigning any duplicate to the
  next unused palette colour - the set on screen right now is guaranteed
  collision-free up to 19 distinct types, not just unlikely to collide.
- **Selecting or pinning a high-risk node silently hid its risk
  indicator** - risk (red border, risk score ≥ 70), pinned (blue double
  border) and selected (orange border) all fought over the single
  `border-color` style property in `GraphCanvas.jsx`'s Cytoscape
  stylesheet; whichever selector was declared later won outright,
  confirmed live: pinning or selecting a risk-78 sample node made its red
  border vanish completely. Fixed by moving risk onto Cytoscape's
  independent `overlay-*` style channel (a halo around the node, core
  Cytoscape.js functionality, not an extension) so it now stays visible
  regardless of pinned/selected state - pin/select keep using
  `border-color` as before, now uncontested.
- **Path-highlighting overwrote a node's fill colour**, losing its
  type-colour identity for exactly the nodes being inspected, and reused
  the same orange as node selection (`node:selected`'s border), so a
  selected node on a highlighted path showed an invisible border against
  its own now-identically-orange fill. Fixed: path-highlight now uses its
  own colour (`#1f9e54`, a green not used anywhere else) and a dashed
  border/style only, never `background-color`.

### Added

- Legend gained an "Indicators" section explaining what the risk halo,
  pinned border, selected border and path-highlight border mean - none of
  this was documented anywhere in the UI before.
- The four status colours are centralised as `STATUS_COLORS` in
  `GraphCanvas.jsx` and deliberately excluded from
  `typeConfigService.js`'s type-colour palette, so a type's own colour can
  never coincidentally look like one of these states.

Version bumped to 1.6.0 (multiple real bugs fixed, not a patch). Full npm
test (300 tests, up from 291 - new `tests/unit/typeConfigService.test.js`)
and lint (0 warnings) pass.

## [1.5.0] - 2026-11-21

### Added

- **Import button**, alongside the existing Export button on the
  Relationship Explorer toolbar. Pick a JSON file previously produced by
  Export > JSON (graph) and GraphLens loads it back onto the canvas,
  replacing the current graph - a convenience for resuming or sharing a
  specific graph snapshot. The file is read entirely client-side via the
  browser's `FileReader` API; nothing is uploaded anywhere, and this is
  not a way to bring Splunk data into GraphLens (see DATA_INGESTION.md for
  that).
- New `shared/services/importService.js` (`parseImportedGraphJson`) -
  the exact counterpart to `exportService.js`'s `exportGraphAsJson`,
  translating the exported JSON shape back into the raw node/edge "row"
  shape `graphTransformer.transformRowsToGraph` expects, so an imported
  file goes through the identical validation/escaping/dedup/limit
  pipeline a live search result does - nothing from a file is trusted any
  more than that.
- New `loadGraphSnapshot` in `graphStateReducer.js` - replaces the whole
  graph with an imported (or any other) node/edge set, bounded by the same
  `maxVisibleNodes`/`maxVisibleEdges` limits as every other admission
  path, and a new `import_graph` audit action.
- Import is gated by the existing `enableExport` feature flag (no new
  setting or capability) - Import and Export are presented as one
  paired feature.
- Help page and USER_GUIDE.md updated with an "Import" section.

Version bumped to 1.5.0 (new feature). Full npm test (280 tests, up from
269 - new `tests/unit/importService.test.js`, `loadGraphSnapshot` cases in
`graphStateReducer.test.js`, and an import-pipeline case in
`tests/security/xss.test.js`) and lint (0 warnings) pass.

## [1.4.0] - 2026-11-21

### Added

- **Help page now mirrors DATA_INGESTION.md, CONFIGURATION.md and
  SECURITY.md**, not just USER_GUIDE.md: three new sections - "Loading
  your own data", "Administrator settings", "Security model" - condense
  those documents' content directly into the in-app Help page
  (`graphlens_help` view), the same pattern already used for the rest of
  the page. These three files were already shipped as flat files inside
  the installed app package by `scripts/package_app.sh` (so they were
  always readable from the installed app's own directory), but this is
  the first release where their content is also visible from within
  GraphLens's own UI, without opening package files directly. Each new
  section ends by pointing at its source document's full version for
  further detail.

Version bumped to 1.4.0 (new content/capability, not a patch - the Help
page itself was unchanged structurally, but gains real new sections).
Full npm test (269 tests) and lint (0 warnings) pass.

## [1.3.0] - 2026-11-21

### Added

- **Lookup-table relationship data source.** The Configuration page's
  "Relationship data source" setting now offers a choice between **Index**
  (the existing, time-series behaviour) and **Lookup (static table)**: in
  lookup mode, every relationship-reading search/expansion reads a Splunk
  lookup table via `| inputlookup <name>` instead of `search index=...` -
  no index, ingestion pipeline, or scheduled search required. See
  DATA_INGESTION.md option D for how to set one up, and the Help page's
  new "Where the relationship data comes from" section.
- New `relationship_source_type` (`index`/`lookup`) and `relationship_lookup`
  settings in `graphlens_settings.conf` (`[search]` stanza), editable from
  the Configuration page alongside the existing `relationship_index`.
- `shared/utilities/splSafety.js` gained `LOOKUP_NAME_PATTERN` and
  `safeLookupNameOrFallback`, mirroring the existing index/sourcetype
  validation, since a lookup name is likewise spliced unquoted into SPL.

### Fixed

- **The Configuration page's "Relationship index" setting silently did
  nothing.** Every relationship-reading template in `splTemplates.js`
  actually used a hardcoded `graphlens_relationship_index` macro
  (`index=graphlens_relationships`, in `default/macros.conf`) - changing
  the setting had no effect on any search, because nothing read it back
  into the macro. Discovered while building the lookup-mode feature above.
  Fixed by making the generating clause of every relationship-reading
  template dynamic: built client-side (`buildRelationshipSourceLines` in
  `splTemplates.js`) from a `source` argument that `configService.js`'s
  new `relationshipSourceFromSettings()` derives from the Configuration
  page's current settings, for both index and lookup mode. The
  `graphlens_relationship_index` macro itself is unchanged and kept, since
  `graphlens_graph_statistics` (never dispatched from the UI - see
  KNOWN_LIMITATIONS.md) still uses it.
- **`edge_id` was never actually derived when a data source omits it**,
  despite DATA_INGESTION.md and DATA_MODEL.md documenting that as
  supported ("edge_id can be omitted - GraphLens derives one
  deterministically from source_id + target_id + relationship_type if
  it's missing"). No such derivation existed anywhere in `splTemplates.js`.
  Every template that groups by edge_id (`buildExpandNodeSpl`,
  `buildEdgeDetailsSpl`, `buildClusterExpandSpl`, and the `dc(edge_id)` in
  `buildNodeDetailsSpl`) therefore silently dropped every such row - `stats
  ... by` over a field entirely ABSENT from a row returns zero rows for
  it, not rows grouped under an empty value, the exact same class of bug
  previously fixed for `evidence_reference` (see 1.0.x history above).
  Discovered live while verifying the lookup-mode feature above (a minimal
  2-row test lookup with no edge_id column returned zero results from
  expand), then confirmed the same bug independently reproduces in index
  mode too, with a real CSV-ingested event (`splunk add oneshot`, not
  `collect`, which does not produce the CSV shape `INDEXED_EXTRACTIONS =
  csv` needs). Fixed with a new `DERIVE_EDGE_ID_LINE` eval
  (`splTemplates.js`) run before any such `stats`, in both index and
  lookup mode, for every affected template.

### Verified

Against a disposable, bare Splunk Docker instance (no GraphLens app
installed, so nothing else could be influencing the result): `|
inputlookup <name>` dispatches successfully as the sole leading
(generating) command via `/services/search/jobs` the same way `search
index=...` does; a `| search <filter>` stage and a bracketed `append [ |
inputlookup ... ]` subsearch both behave identically to their index-mode
equivalents. This avoided repeating this project's recurring pattern of
shipping an SPL-dispatch assumption that turns out wrong against a live
instance. See ARCHITECTURE.md, "How searches retrieve relationships."

A second live check, this time against an actual GraphLens 1.3.0 install
(fresh `splunk/splunk` container, package built/AppInspect-clean, app
installed and restarted): a bare `| inputlookup <name>` (no `.csv`
extension) fails with "requires a .csv or KV store lookup definition"
unless a matching **lookup definition** (Settings > Lookups > Lookup
table definitions) exists - merely uploading the CSV file is not enough.
Confirmed this is handled correctly end-to-end once a lookup definition is
created: the Configuration page's "Relationship lookup" field saves and
loads via `configs/conf-graphlens_settings`, and switching to lookup mode
correctly drives entity search, node details via `append [ | inputlookup
... ]`, and one-hop expansion against a 2-row/3-node test lookup, with
identical result shapes to index mode. DATA_INGESTION.md, the `.conf.spec`
file, CONFIGURATION.md and the Configuration page's own field label were
all updated to say "lookup definition name," not "lookup table name," to
head this off before an administrator hits it.

A third live check specifically targeted the `edge_id` derivation fix,
reproducing it both ways before confirming the fix: in lookup mode (a
2-row test lookup with no `edge_id` column) and in index mode (a real
CSV-shaped event via `splunk add oneshot`, not `| collect`, which writes
auto-kv-style raw text that this sourcetype's `KV_MODE = none` /
`INDEXED_EXTRACTIONS = csv` config does not parse the same way - a
methodology trap worth remembering for future verification). Both
reproduced the identical "zero rows" failure pre-fix and both returned the
correct row, with a sensible derived `edge_id`
(`user:jsmith_AUTHENTICATED_TO_host:server01`), post-fix.

Version bumped to 1.3.0 (new feature + two bug fixes, not a patch). Full
npm test (new lookup-mode, `LOOKUP_NAME_PATTERN`/`safeLookupNameOrFallback`,
and edge_id-derivation tests added - 269 tests total) and lint (0
warnings) pass. AppInspect re-run clean (0 errors/failures, 7 warnings,
same profile as 1.2.0 - see APPINSPECT.md).

## [1.2.0] - 2026-11-21

### Added

- **A fourth page, Help** (`graphlens_help` view / `HelpPage`), reachable
  from the nav tabs on every page. A static, no-search, no-capability
  reference page condensing USER_GUIDE.md for in-app reading - searching,
  expanding, filters, legend, evidence, path finder, export, graph limits,
  resetting. Unlike the other three pages, it dispatches no searches and
  checks no capability, since every user who can open the app at all
  should be able to read it.
- `shared/components/PageNav.jsx` and `default/data/ui/nav/default.xml`
  updated to include it alongside Relationship Explorer, Health and
  Configuration.

Verified end-to-end against a live Splunk instance: the Help page loads
(HTTP 200, zero page errors), shows the correct version, and the nav tabs
correctly link all four pages together.

Version bumped to 1.2.0 (new feature, not a patch). Full npm test (254
tests) and lint (0 warnings) pass; AppInspect re-run clean (0 errors/
failures, 7 warnings, same profile as 1.1.4) - as expected,
`check_for_custom_mako_templates` now also names `Help.html`, alongside
the other three - see APPINSPECT.md.

## [1.1.4] - 2026-11-20

Fixes a genuine readability bug flagged directly: the toolbar (search box,
time range, layout, "Recalculate layout"/"Fit to screen"/"Centre
selected"/"Export" buttons) was very hard to read - all of those controls
rendered with near-white text (`rgb(250, 250, 250)`) and a faint
semi-transparent white border on GraphLens's own white page background.

### Root cause

GraphLens never wrapped its React tree in `@splunk/themes`'
`SplunkThemeProvider`. Confirmed directly from that package's own type
declarations: "`SplunkThemeProvider` defaults to `prisma` `dark`
`compact`, unless the properties have already been set" - so every
`@splunk/react-ui` component was rendering against that library's dark
theme defaults while sitting on GraphLens's hardcoded light/white CSS.
Verified by reading the actual theme tokens (`@splunk/themes/getTheme`):
the faint white border was `interactiveColorBorder`'s dark-theme value,
not a bug in any individual component.

### Fixed

- All three pages now wrap their root component in
  `<SplunkThemeProvider family="enterprise" colorScheme="light"
  density="comfortable">`, matching the classic Splunk Enterprise light
  theme GraphLens's own CSS already assumes. `@splunk/themes` is now an
  explicit direct dependency (it was previously only a transitive one
  pulled in by `@splunk/react-ui`) - see THIRDPARTY.md.
- Verified against a live instance, before/after: every previously
  near-invisible toolbar control (`Last 24 hours`, `Layout`/`cose`,
  `Recalculate layout`, `Fit to screen`, `Centre selected`, `Export`) now
  renders with dark text (`#3c444d`) and a visible border (`#818d99`) on
  white, matching the enterprise/light theme's actual design tokens. The
  "Search" button's own pale-green appearance in an early check turned
  out to be its correctly-styled *disabled* state (empty search box, not
  a bug) - confirmed it renders solid `#1a8929` with white text, good
  contrast, once a search term is typed.

Version bumped to 1.1.4. Full npm test (254 tests) and lint (0
warnings) pass; AppInspect re-run clean (0 errors/failures, 7 warnings,
same as 1.1.3).

## [1.1.3] - 2026-11-20

Found by checking what a user actually sees above GraphLens's own
content: there is no Splunk Web chrome (no app switcher, no header, no
nav) around any of the three pages, and - because GraphLens had no
navigation of its own either - no way to move between Relationship
Explorer, Health and Configuration at all once you had landed on one of
them, other than editing the URL by hand. This has been true since 1.0.0.

### Root cause (not a regression, a platform characteristic)

Confirmed by reading Splunk's own
`appserver/mrsparkle/controllers/view.py` on a live Splunk Enterprise
10.6.1 (build 1) instance: a `type="html"` custom view (what all three of
GraphLens's views are, in `default/data/ui/views/*.xml`) is
*unconditionally* served through `bypass_module_system()`'s fast path,
which never renders Splunk's own app-switcher/nav chrome around the page
- regardless of what the view's own Mako template inherits from. Changing
the templates to inherit from `//layout/view.html` instead of
`//layout/base.html` would not fix this; it would break rendering outright,
since that template requires `VIEW`/`APP`/`modules` context the fast path
never supplies. There is no way to get Splunk's own chrome for a
`type="html"` view; see KNOWN_LIMITATIONS.md.

### Added

- GraphLens now provides its own in-app navigation
  (`shared/components/PageNav.jsx`, a `@splunk/react-ui` `TabBar`) at the
  top of all three pages, linking to the other two. `getAppViewUrl()`
  (`shared/utilities/restClient.js`) builds each link from `window.$C`
  (Splunk's own injected runtime config), the same pattern already used
  for `getSplunkdPath()`.

## [1.1.2] - 2026-11-16

Found by actually opening the Relationship Explorer against the live
1.1.1 RBAC data (not just confirming it existed in the index, as 1.1.1's
own verification did) - searching for a role and clicking Expand silently
did nothing. The underlying expand search was dispatching and "succeeding"
(confirmed in the audit log), but returning zero rows.

### Fixed

- **Expanding or viewing details on any node/edge with no
  `evidence_reference` returned zero results**, not just for the RBAC
  model collector's own data but for any current or future data source
  that leaves this optional field unset. Root cause: `evidence_reference`
  with an empty-string value is not merely empty in an indexed CSV event
  (`INDEXED_EXTRACTIONS = csv`) - the field does not exist on the event at
  all, because Splunk's CSV field extraction never creates a field for an
  empty cell. `stats ... by` grouping on a field that is entirely absent
  from every matching event returns zero result rows (confirmed against a
  live instance), not rows grouped under an empty value. This was latent
  in `buildExpandNodeSpl`/`buildEdgeDetailsSpl`
  (`shared/services/splTemplates.js`) since 1.0.1 - it never fired before
  because the only prior data producer (`scripts/generate_sample_data.py`)
  always populated `evidence_reference` with at least the edge's own id.
  1.1.0's RBAC model collector was the first real data source to leave it
  genuinely unset (correctly, since RBAC edges have no underlying raw
  event to drill into), which is what exposed the bug. Fixed by adding
  `| fillnull value="" evidence_reference` immediately before the `stats`
  in both templates, so the field always exists for grouping purposes
  regardless of what any data source does or doesn't set. Two regression
  tests pin the fillnull's presence and ordering.

## [1.1.1] - 2026-11-16

Fixes found by actually installing 1.1.0 into a live Splunk Enterprise
10.6.1 (build 1) Docker container and enabling the RBAC model collector
as a real scripted input - not just unit tests or a simulated stdin feed
(see DEVELOPMENT.md). Two real bugs would have made the collector
silently produce no data on every real installation; both are fixed here,
and the live check also led to a more precise, least-privilege setup
recommendation.

### Fixed

- **`passAuth = splunk-system-user` is not a real account.** 1.1.0
  shipped this as the collector's authentication mechanism, assuming it
  was a universal reserved value. It is not - Splunk's own
  `inputs.conf.spec` says `passAuth` names a real, existing user account,
  and no such account exists on a default install. The scripted input ran
  (confirmed in `_internal`) but every single invocation failed with "no
  session key on stdin." Fixed by removing the default entirely - there is
  no safe universal value - and requiring an administrator to set
  `passAuth` explicitly via `local/inputs.conf` when enabling the input
  (see RBAC_MODEL.md, "Setup").
- **Session key stdin format was wrong.** `read_session_key()` assumed
  splunkd writes `sessionKey=<key>` as a line to the script's stdin. A
  live probe of the actual bytes splunkd sends showed this is wrong too -
  it is the raw session key with no prefix and no trailing newline. Fixed
  to read stdin directly.
- **Successful runs were indistinguishable from errors in `_internal`.**
  The collector logged a "collected RBAC model: ..." summary to stderr on
  every successful run; splunkd's `ExecProcessor` tags *any* stderr output
  from a scripted input as `log_level=ERROR`, regardless of content, so
  every normal, successful daily run looked like a recurring error to
  anyone watching `index=_internal log_level=ERROR`. Fixed by only logging
  genuine failures.

### Changed

- **More precise, least-privilege `passAuth` guidance.** 1.1.0's
  documentation said the collector needs "admin-equivalent" access.
  Tested against a live instance: a dedicated account holding only
  `edit_roles` and `change_authentication` - not `admin_all_objects` - is
  sufficient for the collector to run end-to-end. RBAC_MODEL.md and
  SECURITY.md now recommend creating exactly that dedicated role/account
  instead of pointing `passAuth` at an actual administrator's own login.

## [1.1.0] - 2026-11-08

### Added

- **RBAC model collector** (`bin/graphlens_rbac_collector.py`, disabled by
  default). A new scripted input that snapshots this Splunk instance's own
  roles, capabilities, per-role index access, role inheritance, and - where
  SAML or LDAP is configured - which identity-provider groups map to which
  roles, and feeds it into the Relationship Explorer as ordinary graph
  data. New node types `saml_group`/`ldap_group` and relationship types
  `CAN_SEARCH`/`INHERITS_FROM` (the `role`/`privilege`/`index`/
  `identity_provider` node types and `GRANTS`/`HAS_ROLE`/
  `AUTHENTICATES_VIA` relationship types already existed). See
  RBAC_MODEL.md for the data model and setup, and SECURITY.md's "RBAC
  model collector" section for why this is off by default and what to
  consider before enabling it - this is the app's first and only piece of
  server-side code and its only component that runs with elevated,
  system-level privilege rather than the requesting user's own session.
  The role/capability/index REST calls this relies on were verified
  against a live Splunk Enterprise 10.6.1 (build 1) instance; the
  SAML/LDAP group-mapping path was not (no SAML/LDAP provider was
  available to test against) - see KNOWN_LIMITATIONS.md.
- `DATA_INGESTION.md`: a guide for loading your own relationship data into
  GraphLens (index schema, ingestion paths, KV Store type registration,
  evidence wiring).

## [1.0.1] - 2026-11-08

Fixes found and verified by installing the built package into a real
Splunk Enterprise 10.6.1 (build 1) Docker container and exercising it end to end
(search, expand, evidence, Configuration, Health) - not just unit tests.
See DEVELOPMENT.md for the full verification notes.

### Fixed

- **HTTP 500 opening the app.** The Relationship Explorer, Health and
  Configuration view templates used `${make_url(...)}` to build their
  CSS/JS asset URLs, assuming Splunk's Mako rendering environment provides
  `make_url` as a bare template global. It does not, and the resulting
  `NameError` caused every view to fail to render. The templates now use a
  hardcoded absolute static path (`/static/app/graphlens/...`) instead,
  which requires no Mako-provided helper at all. See DEVELOPMENT.md item 1.
- **Every search, KV Store write and configuration save failed with "CSRF
  validation failed".** Splunk Web's CSRF check
  (`splunk.appserver.mrsparkle.lib.util.is_xhr`) only reads the CSRF token
  from the `X-Splunk-Form-Key` header when the request also carries
  `X-Requested-With: XMLHttpRequest`; without it, Splunk falls back to
  expecting the token as a `splunk_form_key` POST body parameter instead,
  which GraphLens never sent. Fixed by adding that header to every request
  in `utilities/restClient.js`'s shared `splunkFetch`.
- **Every parameterised search failed** (`| head $safe_result_limit$` and
  similar errored with "The argument must be a positive number or a
  boolean expression."). The saved searches in `default/savedsearches.conf`
  relied on `args.<token>` substitution into `$token$` placeholders on
  `/dispatch` - confirmed against a live instance, Splunk accepts those
  args but never substitutes them into the saved search's own SPL text;
  the dispatched job still contains the literal `$token$` string.
  Replaced with ad-hoc dispatch (`services/search/jobs`) of a complete SPL
  string built from a fixed template in the new
  `shared/services/splTemplates.js`, using the same validated/escaped
  values as before. `default/savedsearches.conf` now only contains the two
  searches with no dynamic token (`graphlens_graph_statistics`,
  `graphlens_health`).
- **The server-side identifier validation guard failed to parse**
  ("Error in 'where'/'EvalCommand' command: The expression is malformed.
  Expected )."). Two designs were tried and found broken on a live
  instance: an `iseval=1` macro (rejected by the search parser outright),
  and a plain-substitution macro taking the identifier as a macro *call
  argument* (Splunk's macro-argument parser does not respect quoting when
  the argument contains a colon, which every GraphLens identifier has,
  e.g. `user:jsmith`). Fixed by making `graphlens_id_pattern` a
  no-argument macro holding only the regex, applied as
  `` match("<id>", `graphlens_id_pattern`) `` so the identifier is never
  passed as a macro argument. See `default/macros.conf`.
- **Entity search failed to match on a node's identifier value.** The
  search term was only prefix-matched against `node_id` (e.g. searching
  "jsmith" would not match `user:jsmith`, which starts with "user:"), so a
  user had to already know the exact `type:` prefix or the precise label
  text. Changed to a substring match on both `node_id` and `node_label`.

### Changed

- Bumped to 1.0.1 (`app.manifest`, `app.conf`, `package.json` kept in
  sync).
- Resolved a newly-disclosed transitive `fast-uri` advisory via
  `npm audit fix` (back to 0 known vulnerabilities).

### Verified but not a defect

- KV Store collection reads (`graphlens_node_types`,
  `graphlens_relationship_types`, `graphlens_audit_log`) returned
  transient HTTP 503s for a few seconds immediately after a fresh
  container start, before resolving on their own. The app degraded
  gracefully (empty state, no crash) rather than erroring, which is the
  intended behaviour - see `typeConfigService.js`'s try/catch-and-fall-back
  pattern.

## [1.0.0] - 2026-07-17

Initial release.

### Added

- Interactive, Cytoscape.js-based relationship graph explorer (Relationship
  Explorer page): entity search, lazy one-hop expansion, reference-counted
  collapse, node/edge selection, pin/unpin, hide, node-type and
  relationship-type filters, risk-score and minimum-event-count filters,
  time-range selector, five built-in Cytoscape layouts, fit/centre/reset,
  client-side shortest-path finder over the visible graph, JSON/CSV/PNG
  export, graph-size limit banner, empty and error states.
- Supporting-event drilldown for both nodes and edges through a bounded,
  pre-approved search template.
- Administrator Configuration page for graph limits, search defaults and
  feature toggles, backed by `graphlens_settings.conf`.
- Health page summarising recent audited actions from the
  `graphlens_audit_log` KV Store collection.
- KV Store collections for curated node/edge metadata, node/relationship
  type display configuration, saved graph views, annotations and the audit
  log.
- Example roles and capabilities (`graphlens_viewer`, `graphlens_analyst`,
  `graphlens_admin`) in `authorize.conf`.
- Synthetic sample data covering security investigation, Splunk
  knowledge-object lineage, logging catalogue, application dependency and
  identity relationship use cases.
- Full documentation set (see README.md for the index).

### Known limitations

See KNOWN_LIMITATIONS.md.
