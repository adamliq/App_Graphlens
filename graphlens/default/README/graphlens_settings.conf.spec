#   Version 1.0.0
#
# This file documents settings for the GraphLens application in
# graphlens_settings.conf. Place deployment-specific overrides in
# local/graphlens_settings.conf. Do not edit default/graphlens_settings.conf.

[limits]
max_visible_nodes = <positive integer>
* Maximum number of nodes the browser will render for a single graph.
* Default: 1000

max_visible_edges = <positive integer>
* Maximum number of edges the browser will render for a single graph.
* Default: 2500

max_expansion_neighbours = <positive integer>
* Maximum number of neighbours returned by a single node expansion.
* Default: 100

max_expansion_depth = <positive integer>
* Maximum number of successive expansion hops tracked for reference
  counting on collapse.
* Default: 3

max_path_depth = <positive integer>
* Maximum number of hops considered by the client-side shortest-path
  finder over the currently visible graph.
* Default: 5

max_search_result_rows = <positive integer>
* Upper bound applied to every controlled search's | head clause.
* Default: 500

search_dispatch_max_time_seconds = <positive integer>
* Maximum wall-clock seconds a dispatched search is allowed to run before
  GraphLens cancels it client-side.
* Default: 30

[search]
relationship_index = <index name>
* Index containing observed, time-series relationship summary events.
* Default: graphlens_relationships

evidence_default_index = <index name or "*">
* Fallback index constraint applied to evidence searches when a
  relationship record does not specify its own source_index.
* Default: *

default_earliest = <Splunk relative time literal>
* Default: -24h

default_latest = <Splunk relative time literal>
* Default: now

[features]
enable_export = <true|false>
enable_annotations = <true|false>
enable_saved_views = <true|false>
enable_clustering = <true|false>
enable_path_finder = <true|false>

[allowlist]
allowed_node_types = <comma-separated list, or empty>
* When empty, allowed node types are governed entirely by the enabled flag
  in the graphlens_node_types KV Store collection.

allowed_relationship_types = <comma-separated list, or empty>
* Same behaviour as allowed_node_types, backed by
  graphlens_relationship_types.

allowed_layouts = <comma-separated list>
* Default: cose,concentric,breadthfirst,circle,grid

allowed_export_formats = <comma-separated list>
* Default: json,csv,png
