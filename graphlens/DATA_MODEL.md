# Data model

## Node

```json
{
  "node_id": "user:jsmith",
  "node_type": "user",
  "node_label": "John Smith",
  "node_group": "identity",
  "description": "User account",
  "risk_score": 65,
  "first_seen": "2026-07-15T02:31:00Z",
  "last_seen": "2026-07-17T08:42:00Z",
  "event_count": 37,
  "source_index": "identity",
  "source_sourcetype": "identity:relationship",
  "metadata": {}
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `node_id` | string | yes | Namespaced, stable identifier. Must match `^[A-Za-z0-9][A-Za-z0-9:_\-.@/]{0,254}$` (see splSafety.js `ID_PATTERN`). |
| `node_type` | string | yes | Short type token, e.g. `user`, `host`, `ip`. Governed by `graphlens_node_types`. |
| `node_label` | string | yes | Display label. HTML-escaped on ingest; treat as untrusted. |
| `node_group` | string | no | Free grouping label (business service, subnet, etc.) for clustering. |
| `description` | string | no | Free text. HTML-escaped on ingest. |
| `risk_score` | number | no | Clamped to 0-100 on ingest. |
| `first_seen` / `last_seen` | ISO-8601 string | no | Widened (min/max) across duplicate rows on merge. |
| `event_count` | number | no | Summed across duplicate rows on merge. |
| `source_index` / `source_sourcetype` | string | no | Used to drive evidence lookup; validated against `INDEX_NAME_PATTERN`/`SOURCETYPE_PATTERN` before use in SPL. |
| `metadata` | object | no | Free-form curated metadata (KV Store only). |

## Edge

```json
{
  "edge_id": "edge:2a7d9c",
  "source_id": "user:jsmith",
  "target_id": "host:server01",
  "relationship_type": "AUTHENTICATED_TO",
  "relationship_label": "Authenticated to",
  "directed": true,
  "first_seen": "2026-07-15T02:31:00Z",
  "last_seen": "2026-07-17T08:42:00Z",
  "event_count": 37,
  "risk_score": 65,
  "source_index": "authentication",
  "source_sourcetype": "auth:summary",
  "evidence_reference": "edge:2a7d9c",
  "metadata": {}
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `edge_id` | string | no | Derived deterministically from `source_id`+`target_id`+`relationship_type` if omitted (`graphTransformer.deriveEdgeId`). |
| `source_id` / `target_id` | string | yes | Must be valid node identifiers. |
| `relationship_type` | string | yes | Short type token. Governed by `graphlens_relationship_types`. |
| `relationship_label` | string | no | Display label; defaults to `relationship_type`. |
| `directed` | boolean | no | Defaults from `graphlens_relationship_types.directed`, then `true`. |
| `first_seen` / `last_seen` / `event_count` / `risk_score` | as above | no | Same merge semantics as nodes. |
| `evidence_reference` | string | no | Opaque key joined against evidence events' own `evidence_reference` field - see "Evidence" below. Must be a valid identifier. |
| `metadata` | object | no | Free-form curated metadata (KV Store only). |

## Identifier conventions

Identifiers are namespaced (`type:value`), stable, deterministic where
practical, and safe by construction for SPL, React and Cytoscape.js
because they are restricted to a conservative character set (see
`ID_PATTERN` above - no quotes, backslashes, pipes, wildcards, spaces or
control characters). Examples used throughout sample data and search
templates:

```
user:jsmith
host:server01.example.com
ip:127.0.0.1
domain:example.com
process:sha256:abc123
index:windows
sourcetype:XmlWinEventLog:Security
savedsearch:privileged_login
dashboard:security_posture
application:finance_system
```

Security decisions are never derived from `*_label` fields - only from
`node_id`/`edge_id`/`node_type`/`relationship_type`, and ultimately from
Splunk's own role-based access control on the underlying search.

## Indexed relationship event schema

Events in the `graphlens_relationships` index (sourcetype
`graphlens:relationship`, see `default/props.conf`) carry the following
fields, consumed by `default/savedsearches.conf`'s `graphlens_edge_fields`
macro:

```
edge_id, source_id, source_type, source_label,
target_id, target_type, target_label,
relationship_type, relationship_label,
event_count, first_seen, last_seen, risk_score,
source_index, source_sourcetype, evidence_reference
```

See `scripts/generate_sample_data.py` and
`sample_data/graphlens_relationships_sample.csv` for a complete synthetic
example set, and `scripts/indexes.conf.example` for the (not
automatically applied) index definition.

## KV Store collections

Defined in `default/collections.conf`, exposed as SPL lookups in
`default/transforms.conf`:

| Collection | Purpose | Write access |
|---|---|---|
| `graphlens_nodes` | Curated node metadata merged into `graphlens_node_details` | `graphlens_admin` |
| `graphlens_edges` | Curated, static (non-time-series) relationships | `graphlens_admin` |
| `graphlens_node_types` | Display config: colour, shape, icon, enabled | `graphlens_admin` |
| `graphlens_relationship_types` | Display config: colour, directed, enabled | `graphlens_admin` |
| `graphlens_saved_views` | Saved graph views (layout, expansion state, filters) | `graphlens_analyst`, `graphlens_admin` |
| `graphlens_annotations` | User/shared annotations on a node or edge | `graphlens_analyst`, `graphlens_admin` |
| `graphlens_audit_log` | Operational audit trail | any authenticated app role (append-only) |

To seed `graphlens_node_types` / `graphlens_relationship_types` from the
bundled CSV starting points after installation, run once from Splunk
Search (requires `graphlens_manage_collections`):

```spl
| inputlookup graphlens_sample_node_types | outputlookup graphlens_node_types
| inputlookup graphlens_sample_relationship_types | outputlookup graphlens_relationship_types
```

## Evidence / supporting events

GraphLens never stores raw SPL in a relationship record. Instead,
`evidenceQueryBuilder.js` derives a bounded, validated query from:

- **Edges**: `evidence_reference` (an opaque key), plus the edge's own
  `source_index`/`source_sourcetype`, joined against an evidence event's
  own `evidence_reference` field (see
  `sample_data/graphlens_evidence_sample.csv`).
- **Nodes**: a conservative per-type field heuristic (e.g. `user` ->
  `src_user`, `host` -> `dest_host`) matched against the node's own label,
  again scoped to the node's `source_index`/`source_sourcetype`.

This is dispatched through the single `graphlens_evidence_search` saved
search - see ARCHITECTURE.md and SECURITY.md.

## Clusters (optional grouping)

```json
{
  "cluster_id": "cluster:windows_servers",
  "cluster_type": "technology_group",
  "cluster_label": "Windows Servers",
  "member_count": 82,
  "relationship_count": 1450,
  "risk_score": 70
}
```

Cluster/group nodes are produced by grouping visible nodes on a field
(node type, `source_index`, `node_group`, etc.) client-side, or expanded
via the optional `graphlens_cluster_expand` saved search, which is bounded
by `safe_cluster_limit` the same way `graphlens_expand_node` is bounded by
`safe_expansion_limit`.
