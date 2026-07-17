# Configuration

## Administrator configuration (`graphlens_settings.conf`)

Defaults live in `default/graphlens_settings.conf`; documented in
`default/README/graphlens_settings.conf.spec`. **Never edit the `default/`
copy.** Override individual settings in `local/graphlens_settings.conf`,
or use the in-app Configuration page (requires the
`graphlens_manage_config` capability), which writes to `local/` for you
through Splunk's standard `configs/conf-*` REST endpoint.

| Stanza | Setting | Default | Meaning |
|---|---|---|---|
| `[limits]` | `max_visible_nodes` | 1000 | Hard cap on rendered nodes |
| | `max_visible_edges` | 2500 | Hard cap on rendered edges |
| | `max_expansion_neighbours` | 100 | Max neighbours returned by one expansion |
| | `max_expansion_depth` | 3 | Tracked for expansion-chain bookkeeping |
| | `max_path_depth` | 5 | Max hops considered by the path finder |
| | `max_search_result_rows` | 500 | Upper bound on every controlled search's `\| head` |
| | `search_dispatch_max_time_seconds` | 30 | Client-side search timeout |
| `[search]` | `relationship_index` | `graphlens_relationships` | Index searched by `graphlens_relationship_index` macro |
| | `evidence_default_index` | `*` | Fallback index for evidence search |
| | `default_earliest` / `default_latest` | `-24h` / `now` | Default time range |
| `[features]` | `enable_export` / `enable_annotations` / `enable_saved_views` / `enable_clustering` / `enable_path_finder` | all `true` | Feature toggles |
| `[allowlist]` | `allowed_node_types` / `allowed_relationship_types` | empty (governed by KV Store `enabled` flags instead) | Optional hard allowlist |
| | `allowed_layouts` | `cose,concentric,breadthfirst,circle,grid` | Layouts offered in the UI |
| | `allowed_export_formats` | `json,csv,png` | Export formats offered in the UI |

Changing `max_visible_nodes`/`max_visible_edges` upward increases browser
memory/CPU use during rendering - see TESTING.md's performance scenarios
before raising these substantially beyond the tested 1000/2500 defaults.

## Type display configuration

Node and relationship "look" (colour, shape, icon, enabled) is configured
per type in the `graphlens_node_types` / `graphlens_relationship_types` KV
Store collections, editable by an administrator directly via the KV Store
REST API or Splunk Web's KV Store lookup editor. Seed them from the
bundled CSVs as described in INSTALL.md step 4. A type with no curated
entry still renders, using a deterministic colour derived from its type
name (`typeConfigService.colorForType`) so the graph is never left
uncoloured while an administrator catches up on curation.

## Roles and capabilities

See ADMIN_GUIDE.md.

## Upgrade

- Files under `default/` are replaced on upgrade; anything you need to
  persist must be in `local/` or in KV Store, never in `default/`.
- KV Store collection data (curated nodes/edges, type config, saved views,
  annotations, audit log) is preserved across an app upgrade - upgrading
  only replaces the app's file-based configuration, not KV Store contents.
- Saved views and annotations are unaffected by an upgrade unless a future
  release changes their schema; check CHANGELOG.md for any migration note
  before upgrading across a major version.
- Re-run `npm run build && npm run package` (or use the vendor-provided
  release archive) rather than hand-editing a previously installed copy.

## Rollback

Keep the previous release's `.tar.gz` archive. To roll back: remove the
current app directory, install the previous archive, and restart. `local/`
configuration is untouched by this process as long as you do not delete
it; KV Store data is likewise untouched. If a new release changed a KV
Store collection's schema (see CHANGELOG.md), rolling back after data has
been written in the new schema may require manual data cleanup - check the
release notes for the version you are rolling back from.
