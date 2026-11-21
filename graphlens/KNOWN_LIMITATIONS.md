# Known limitations

## Forward-looking risk (read this first)

- **GraphLens's four views are built on custom Mako templates
  (`appserver/templates/*.html`), which Splunk has stated it will stop
  supporting in a future platform version.** `splunk-appinspect`'s
  `check_for_custom_mako_templates` check (added in a release newer than
  the one used for 1.0.0) reports: "deprecated in Splunk Enterprise 10.4.
  Future Splunk platform versions will no longer support custom Mako
  templates." The templates are confirmed working today against a live
  Splunk Enterprise 10.6.1 (build 1) instance, and this is only a
  `warning`, not a failure - but it means the Relationship Explorer,
  Health, Configuration and Help pages will eventually stop loading on
  some future Splunk release unless GraphLens migrates to whatever
  Splunk's then-current supported mechanism is for serving a custom page
  without a Mako view. See APPINSPECT.md's `check_for_custom_mako_templates`
  section for why this document deliberately does not guess at that
  replacement mechanism, and what to check before the next release.

## No Splunk Web chrome around `type="html"` views

GraphLens's pages render with no Splunk Web app-switcher/nav chrome
around them at all - confirmed as a Splunk platform characteristic, not a
GraphLens defect, by reading `appserver/mrsparkle/controllers/view.py` on
a live Splunk Enterprise 10.6.1 (build 1) instance: a `type="html"`
custom view (what `default/data/ui/views/*.xml` declares all of
GraphLens's views as) is unconditionally routed through
`bypass_module_system()`'s fast path, which never builds the `VIEW`/
`modules` structure Splunk's own chrome-rendering template
(`//layout/view.html`) needs - this is true no matter what the view's own
Mako template inherits from, and there is no setting that changes it.

Since 1.1.3, GraphLens provides its own in-app navigation
(`shared/components/PageNav.jsx`) to work around the resulting "no way to
reach the other pages" problem - see CHANGELOG.md. What this does not
restore: the standard Splunk header (Activity/Settings/username menu, app
switcher). There is no in-app substitute for those; use your browser
back/forward or Splunk's own app list (`/en-US/app/launcher/home`, or your
instance's configured home) to switch away from GraphLens entirely.

## Security / access control

- **The RBAC model collector's SAML/LDAP group mapping is unverified
  against a live instance.** `bin/graphlens_rbac_collector.py` (disabled
  by default - see RBAC_MODEL.md and SECURITY.md) derives SAML/LDAP
  group-to-role mappings from `authentication.conf`'s `roleMap_<strategy>`
  stanzas, which is documented Splunk convention but, unlike the rest of
  this app's REST-API assumptions, was not checked against a live
  SAML- or LDAP-configured Splunk instance before release (this
  repository's test environment has neither configured). The
  role/capability/index portion of the collector *was* verified live. See
  RBAC_MODEL.md, "Identity provider support," before relying on the
  group/role edges it produces.
- **KV Store access control is collection-level, not row-level.** A role
  with write access to `graphlens_annotations` or `graphlens_saved_views`
  can technically write/delete any document in that collection via the
  raw REST API, not only its own records. See SECURITY.md.
- **Configuration-write authorisation relies on Splunk's default
  `admin_all_objects` gate** on the generic `configs/conf-*` REST
  endpoint. Finer-grained delegation requires a `restmap.conf` capability
  mapping that this release does not ship (see SECURITY.md and
  DEVELOPMENT.md item 3) because the exact syntax has varied across Splunk
  versions and must be verified against the target version.

## Functional scope

- **`graphlens_graph_statistics` (default/savedsearches.conf) is not
  dispatched from anywhere in the current UI** - it exists and is
  documented, but nothing in `src/main/webapp` calls it. It also still
  reads from the `graphlens_relationship_index` macro's hardcoded index
  name regardless of the Configuration page's "Relationship data source"
  setting (index vs. lookup, added in 1.2.0 - see CHANGELOG.md), since
  converting it to respect that setting the way the UI-reachable searches
  now do would mean rebuilding it as an ad-hoc template with no UI
  consumer to verify it against. Wire it up (and convert it the same way)
  before relying on it.
- **Node details do not re-query on every selection.** The details panel
  shows data already returned by the search that introduced the node
  (initial search or expansion), rather than re-dispatching the
  `buildNodeDetailsSpl` template on every click, to avoid running a search
  on every pointer interaction. That template exists and is available for
  a future "refresh details" action.
- **Path finder is client-side only** and limited to the graph currently
  loaded in the browser, bounded by `max_path_depth`. It is not a
  substitute for a full graph-database traversal - see USER_GUIDE.md for
  the exact wording shown to users so this is never overstated.
- **Clustering/grouping is basic in 1.0.0.** Nodes can be grouped
  client-side by a field, and the `buildClusterExpandSpl` template exists
  for bounded server-side cluster expansion, but there is no dedicated
  "collapsed aggregate node" UI affordance yet (section 13 of the original
  design brief) - this is a candidate for a future release.
- **No dedicated component/browser test suite** ships in 1.0.0 (unit
  tests for the logic layer only) - see TESTING.md, "Component/browser
  tests" for what to add before a broader rollout.
- **Dagre/Cola layouts are not included.** Only Cytoscape core's built-in
  layouts (cose, concentric, breadthfirst, circle, grid) are used, so no
  extra layout dependency needs to be packaged/vetted. A future release
  could add `cytoscape-dagre`/`cytoscape-cola` if a customer need
  justifies the extra dependency surface.
- **Import only accepts a GraphLens JSON export, and always replaces the
  whole current graph** - there is no way to import a CSV file (nodes/
  edges exports are flat tables and do not round-trip the structure JSON
  does) or to merge an imported file into the graph already on screen.
  Import a file first, then expand further, if you want to combine them.
- **The query language (`graphQueryLanguage.js`) supports a deliberately
  small, fixed grammar** - one document, one root field always named
  `node`, no fragments, variables, aliases or directives. Concretely:
  - A root `node(...)` needs either a `search` or an `id` argument (an
    optional `type` argument and `limit` further filter/bound the
    result); `id` takes precedence if both are given.
  - An **`id`-rooted query resolves the node via its own one-hop
    expansion** (there is no standalone "fetch a node's own metadata"
    search wired into the app - see `buildNodeDetailsSpl`'s comment in
    `splTemplates.js`), so a node with zero relationships cannot be
    resolved by `id`, even if it exists. A side effect of resolving it
    this way: the root node's own `riskScore`/`eventCount` come back `0`
    rather than its true aggregate, since those two fields live on the
    *edge* rows this expansion returns, not on a row for the node itself
    - a neighbour reached by following a relationship *from* that root
      still shows its correct values. The same is true of a **saved
      view's** starting node on load, for the identical reason (see
      below).
  - A field with no nested selection set must be one of the fixed scalar
    names (`id`, `label`, `type`, `group`, `description`, `riskScore`,
    `eventCount`, `firstSeen`, `lastSeen`, `sourceIndex`,
    `sourceSourcetype`); any other such field is a syntax/validation
    error, not an alias for something else.
  - A field with a nested selection set is a relationship traversal,
    matched case-insensitively against `relationship_type` (or an
    explicit `type` argument, letting the field itself be named anything);
    it takes optional `direction` (`OUTGOING`/`INCOMING`/`BOTH`, default
    `BOTH`) and `limit` arguments.
  - A field name can only be used once within a given selection set - a
    direct consequence of having no aliases, since the name also doubles
    as its key in the result tree. To follow the same relationship type
    twice with different `direction`/`limit` filters (e.g. outgoing and
    incoming separately), give each field its own name and an explicit
    `type` argument naming the real relationship type, rather than
    repeating the same field name.
  - Nesting depth is capped by `settings.max_expansion_depth` (the same
    limit node-by-node expansion is implicitly bounded by elsewhere), and
    total search dispatches by a hard `MAX_QUERY_EXPANSIONS` ceiling
    (`graphQueryExecutor.js`) - a large or heavily-nested query can come
    back truncated (`diagnostics.truncated`) rather than exhaustive.
  - A relationship field that loops back to an ancestor node on its own
    branch is included in the result but not recursed into further
    (`cycleTruncated: true` in the returned tree) - this is cycle
    *detection*, not cycle *traversal*; it will never return every path
    through a cyclic graph.
  - There is no way to filter nodes/edges by anything other than identity,
    type and relationship traversal from this query panel - risk score,
    event count and time-range filtering remain the separate Risk filter/
    time range controls, applied to whatever the query loads onto the
    canvas.
- **Multi-select requires holding Shift while dragging a box.** An
  ordinary click-and-drag still pans the canvas, exactly as before this
  was added - box/lasso-select was deliberately kept off a plain drag so
  it could never regress that. Clicking a node type in the legend selects
  every *currently visible* node of that type; it has no equivalent for
  relationship types, since the existing relationship-type filter
  (hide/show by type) already covers the one bulk action that would make
  sense for an edge.
- **The toolbar's Text view is read-only and replaces the canvas rather
  than sitting alongside it.** Switching to it unmounts the Cytoscape
  canvas entirely (rather than only hiding it), so your current pan/zoom
  position is not kept when you switch back to Diagram - the layout
  simply re-runs, exactly as it would after any other full graph reload.
  Selecting, expanding, pinning, and multi-select are all canvas-only;
  Text is a different way to look at the identical, already-filtered
  node/edge data, not a second way to act on it.
- **The time slicer and session style overrides are both purely
  client-side and apply to the whole visible graph** - there is no way to
  slice or restyle only part of it, and neither is remembered anywhere
  once the page reloads (the time slicer's window resets to "no window",
  and every style override is gone).
- **Saved views only work for a graph that started from a single search
  result.** A graph built via Import or the graph query panel's "Load
  onto canvas" can have several starting nodes at once (or none), and the
  `graphlens_saved_views` schema's `initial_node_id` column can only name
  one - saving such a graph is refused with a clear error rather than
  silently picking one of several equally-plausible starting points.
  Loading a view re-dispatches a live search for the same nodes rather
  than restoring a frozen snapshot (see ARCHITECTURE.md) - a node that no
  longer has any relationships, or has lost the specific relationship
  that was expanded before, is handled the same way an ordinary live
  expansion of it would be, not specially. The starting node is resolved
  the same way an `id`-rooted graph query is, so the same caveat applies:
  its own `riskScore`/`eventCount` come back `0` on load rather than its
  true aggregate (see "Functional scope" above) - every other node in
  the view shows its correct values. A saved view also does not
  remember which individual nodes were **Hidden** (as opposed to pinned,
  type-filtered, or expanded) - that action is a temporary declutter
  distinct from the rest of a view's state (see "Interacting with the
  graph" in USER_GUIDE.md), and the collection's schema has no column for
  it. Saving a view always creates a new entry, even under a name you
  already used - there is no "overwrite the existing view with this
  name" action yet; delete the old one if you want to replace it. Saved
  views are private to the user who created them in this release - the
  underlying KV Store collection already has a `sharing` column for a
  future shared-views release, but nothing in the current UI ever sets it
  to anything but `"private"` (see SECURITY.md for what "private" does
  and does not guarantee).

## Packaging / environment

- **Mako view templates use hardcoded absolute static paths**
  (`/static/app/graphlens/...`), fixed after an earlier version's
  `${make_url(...)}` call caused a live HTTP 500 on open (see
  DEVELOPMENT.md item 1 and CHANGELOG.md). This is standard and confirmed
  working, but will need the deployment's root path prefixed if Splunk Web
  is mounted behind a non-default `MRSPARKLE_ROOT_PATH` - verify against
  your specific deployment if applicable.
- **Icons/logo are placeholders**, generated by
  `scripts/generate_icons.py` (a simple graph-node glyph, no real
  wordmark text, since no font rasteriser was available in the build
  environment). Replace `static/appIcon.png`, `static/appIcon_2x.png`,
  `static/appLogo.png`, `static/appLogo_2x.png` with real designed
  artwork before a public Splunkbase submission.
- **`[MINIMUM_SPLUNK_VERSION]` placeholder** in INSTALL.md must be filled
  in with a version you have actually validated against.
- **Support/security contact addresses are placeholders**
  (`<VENDOR_SUPPORT_EMAIL>`, `<SECURITY_CONTACT_EMAIL>`,
  `<SOURCE_REPOSITORY_URL>` in SUPPORT.md/SECURITY.md) and must be filled
  in before Splunkbase submission.

## Data model

- **Evidence lookup for nodes uses a heuristic field-name mapping**
  (`evidenceQueryBuilder.NODE_TYPE_KEY_FIELD`) covering the sample node
  types (`user`, `host`, `server`, `ip`, `process`, `domain`). Other node
  types fall back to a generic `value` field, which will only return
  evidence if your indexed events actually use that field name - curate
  via `graphlens_nodes` or extend the mapping for your own node types.
- **Audit log is not automatically retained/purged.** See ADMIN_GUIDE.md
  for a recommended cleanup approach; GraphLens does not ship a scheduled
  cleanup search by default (deliberately - to avoid introducing an
  always-on scheduled search customers did not opt into).
