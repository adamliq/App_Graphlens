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
| | `max_expansion_depth` | 3 | Tracked for expansion-chain bookkeeping; also the hard cap on a graph query's relationship nesting (see "Query language" below) |
| | `max_path_depth` | 5 | Max hops considered by the path finder |
| | `max_search_result_rows` | 500 | Upper bound on every controlled search's `\| head` |
| | `search_dispatch_max_time_seconds` | 30 | Client-side search timeout |
| `[search]` | `relationship_source_type` | `index` | `index`, `lookup` or `saved_search` - where observed relationship data comes from (see DATA_INGESTION.md). Setting this to `saved_search`, and changing `relationship_saved_search`, both require the `graphlens_use_search_source` capability - see SECURITY.md |
| | `relationship_index` | `graphlens_relationships` | Index searched when `relationship_source_type = index` |
| | `relationship_lookup` | `graphlens_relationships_lookup` | **Lookup definition** name (not a raw CSV filename) read via `\| inputlookup` when `relationship_source_type = lookup` - see DATA_INGESTION.md |
| | `relationship_saved_search` | empty | Saved search name read via `\| savedsearch` when `relationship_source_type = saved_search` - see DATA_INGESTION.md |
| | `evidence_default_index` | `*` | Fallback index for evidence search |
| | `default_earliest` / `default_latest` | `-24h` / `now` | Default time range |
| `[features]` | `enable_export` / `enable_annotations` / `enable_saved_views` / `enable_clustering` / `enable_path_finder` / `enable_graph_query` | all `true` | Feature toggles |
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

## Demo data

The Configuration page's "Load demo data" button, gated by the
`graphlens_manage_collections` capability (same as the manual steps in
DATA_INGESTION.md/INSTALL.md it automates), does three things:

1. Seeds `graphlens_node_types` / `graphlens_relationship_types` from the
   bundled sample CSVs (`| inputlookup ... | outputlookup ...`) - this
   always **replaces** the current contents of those two collections.
2. Loads a small bundled set of sample relationships (`lookups/
   graphlens_sample_relationships.csv`, the same data `DATA_INGESTION.md`'s
   worked example is built from) into whichever `relationship_source_type`
   is currently configured:
   - **Index mode**: re-ingests the sample rows as new events into the
     configured `relationship_index` via `| collect`, under a dedicated
     `graphlens:relationship:demo` sourcetype (see ARCHITECTURE.md for why
     a distinct sourcetype is needed). This does not remove any existing
     data in that index, but **the index must already exist first**.
   - **Lookup mode**: **replaces** the entire contents of the configured
     `relationship_lookup` via `| outputlookup` - the same
     destructive-by-design behaviour that command always has. **The
     configured name must already be a registered lookup *definition***
     (DATA_INGESTION.md section D step 2 - Settings > Lookups > Lookup
     table definitions), not merely a setting value: confirmed live that
     `| outputlookup` fails outright against a name with no definition yet.
3. Writes one `load_demo_data` entry to the audit log (see the Health
   page), the same as every other tracked action.

This is a convenience for trying GraphLens out, or demoing it, before
bringing in real data - it is not part of bringing your own data in (see
DATA_INGESTION.md). It is not available when `relationship_source_type =
saved_search` (below) - there is no bundled relationship data to load into
a search you authored yourself; the Configuration page's Load demo data
button is disabled with an explanation in that mode.

## Relationship data source: saved search

`relationship_source_type = saved_search` is a third alternative to Index
and Lookup (above), for relationship data better expressed as an
already-authored search - a join across several indexes, a data model
search, anything not naturally a single index or a single static table -
than as either of those. GraphLens runs it via `| savedsearch
"<relationship_saved_search>"`, the same way index mode runs `search
index=...` and lookup mode runs `| inputlookup <name>`; its results must
already be shaped to the relationship schema (DATA_MODEL.md) the same way
an indexed event or a lookup row already has to be - GraphLens does not
transform them.

**Setting `relationship_source_type` to `saved_search`, and changing
`relationship_saved_search` once it is, both require the
`graphlens_use_search_source` capability** - deliberately not granted to
any example role by default (default/authorize.conf), unlike every other
setting on this page, which only needs `graphlens_manage_config`. See
SECURITY.md, "Saved search as a relationship data source," for why this
is kept separate: pointing GraphLens at a saved search means trusting
that search's own author and content, not reviewing it the way GraphLens
reviews its own bounded SPL templates.

## Query language

The Relationship Explorer's text query panel (`enable_graph_query`, above)
compiles a restricted, GraphQL-like syntax into the same bounded SPL
templates the rest of the app uses - see ARCHITECTURE.md ("How the query
language compiles to existing searches"), SECURITY.md ("The query
language introduces no new SPL injection surface") and
KNOWN_LIMITATIONS.md for the grammar's restrictions. Turning the feature
off removes the panel from the UI; it adds no capability or permission of
its own, since every search it can run is one a user's existing
permissions already allow them to run by hand.

## Multi-select, time slicer and style overrides

`enable_time_slicer` and `enable_style_overrides` (above) each gate one
small, purely client-side panel - a time-window filter over data already
loaded, and a per-type colour override kept in that browser tab's memory
only, never written anywhere (see SECURITY.md). Turning either off
removes its panel from the UI only; neither adds a capability, a search,
or a setting written anywhere else. Multi-select (Shift-drag box-select,
or clicking a type in the legend) and its bulk actions have no separate
toggle - they reuse the same pin/hide/expand actions available to a
single node, just applied to several at once.

## Saved views

The Relationship Explorer's Saved views panel (`enable_saved_views`,
above) stores a named starting-point-plus-expansion "recipe" per user in
the `graphlens_saved_views` KV Store collection - see ARCHITECTURE.md
("Multi-select, the time slicer, style overrides and saved views") for
how loading one replays live searches rather than restoring a frozen
snapshot, and why only a graph with a single starting node can be saved
this way. Private to the current user in this release, as a UI
convention rather than a KV Store ACL (see SECURITY.md) - the
collection's `sharing` column exists for a future shared-views release
but nothing in the current UI sets it to anything but `"private"`.

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
