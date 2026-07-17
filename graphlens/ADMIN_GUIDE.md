# Administrator guide

## Roles and capabilities

`default/authorize.conf` defines ten fine-grained capabilities
(`graphlens_run_search`, `graphlens_view_evidence`, `graphlens_export_graph`,
`graphlens_create_annotation`, `graphlens_manage_shared_annotation`,
`graphlens_save_view`, `graphlens_manage_shared_view`,
`graphlens_manage_config`, `graphlens_manage_collections`,
`graphlens_view_health` - see SECURITY.md for what each grants) and three
example roles built from them:

- **`graphlens_viewer`**: search, expand/collapse, view evidence, export.
  Cannot change configuration, save views, or annotate.
- **`graphlens_analyst`** (imports `graphlens_viewer`): additionally save
  views, create annotations, use the path finder.
- **`graphlens_admin`** (imports `graphlens_analyst`): additionally manage
  shared annotations/views, edit `graphlens_settings.conf`, curate KV
  Store node/edge/type data, view the Health page.

Clone these roles rather than editing them in place if you need a
different capability mix - `authorize.conf` local overrides otherwise
apply to every deployment that imports this app's defaults.

Assign a role to a user the normal Splunk way (Settings > Users, or your
identity-provider-driven role mapping on Splunk Cloud), and ensure the
role also has the app itself in its allowed app list so GraphLens appears
in their app switcher.

## Tuning graph limits

See CONFIGURATION.md for the full settings table. Recommended starting
points (already the shipped defaults): 1000 visible nodes, 2500 visible
edges, 100 neighbours per expansion, depth 3, path-finder depth 5. Raise
these only after testing at the new scale in a non-production environment
- `tests/performance/graphScale.test.js` documents the scale points this
application has actually been tested at (100/500/1000 nodes) and see
TESTING.md for the corresponding manual/CI procedure against a live
Splunk instance.

## Managing KV Store data

- **Type display config**: edit `graphlens_node_types` /
  `graphlens_relationship_types` via the KV Store REST API, or seed/reset
  from the bundled CSVs (see INSTALL.md step 4).
- **Curated node/edge metadata**: edit `graphlens_nodes` / `graphlens_edges`
  the same way, to add descriptions/groups/risk scores that aren't derived
  from indexed events.
- **Saved views / annotations**: normally managed by end users; an
  administrator (`graphlens_manage_shared_view` /
  `graphlens_manage_shared_annotation`) can additionally edit or remove
  ones shared at the app level.
- **Audit log** (`graphlens_audit_log`): grows over time with one record
  per tracked user action. GraphLens does not purge it automatically -
  schedule a periodic cleanup search if you want bounded retention, e.g.:

  ```spl
  | inputlookup graphlens_audit_log
  | where created_time < relative_time(now(), "-90d")
  ```

  paired with a KV Store delete of the matching `_key`s (KV Store does not
  support delete-by-search directly from SPL; use the
  `storage/collections/data/graphlens_audit_log` REST endpoint with a
  `query` filter, or Splunk Web's KV Store lookup editor, to remove
  matching records older than your retention window).

## Health page

Requires `graphlens_view_health`. Shows: application version,
configuration status, relationship index in use, and a table of recent
audited actions (last 7 days) broken down by action and outcome, sourced
entirely from `graphlens_audit_log` - no indexed data or internal Splunk
logs required. Use it to spot elevated `failure`/`denied` outcomes for a
given action, which usually indicate a permissions gap, a bad index name
in configuration, or a saved-search dispatch error.

## Search head clustering

`default/server.conf` declares
`[shclustering] conf_replication_include.graphlens_settings = true` so the
one custom conf file GraphLens ships (`graphlens_settings.conf`)
replicates across search head cluster members like every standard conf
file already does. No further SHC-specific action is required.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Entity search returns nothing | No data indexed yet, or wrong index in `graphlens_settings.conf` | Verify `[search] relationship_index`; confirm the index has recent events in your selected time range |
| "Graph size limit reached" immediately | Limits set too low for your data density | Raise `max_visible_nodes`/`max_visible_edges` in Configuration |
| Evidence panel always empty | Node/edge's `source_index`/`source_sourcetype` doesn't match where the raw events actually live, or the per-type key-field heuristic doesn't match your field names | Curate the node/edge in `graphlens_nodes`/`graphlens_edges`, or adjust your indexed event fields to match `evidenceQueryBuilder.js`'s `NODE_TYPE_KEY_FIELD` mapping |
| Configuration page shows read-only | Current user lacks `graphlens_manage_config` | Grant the capability via a role update |
| Health page says "insufficient capability" | Current user lacks `graphlens_view_health` | Grant the capability via a role update |
| Search fails with a permission error | User's role lacks access to the underlying index | Grant `srchIndexesAllowed`/index access the normal Splunk way - GraphLens cannot bypass this |
| KV Store errors on save (annotations/views) | User's role lacks collection write access | Confirm they hold `graphlens_analyst` or `graphlens_admin` (see `metadata/default.meta`) |

For anything not covered here, check the browser console for the specific
error GraphLens surfaced (errors are shown as short, sanitised messages in
the UI; the console may have more detail for support purposes) and see
SUPPORT.md.
