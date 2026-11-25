# Bringing in your own data

GraphLens is a visualization layer over data already in Splunk - it has no
file-upload feature of its own. To see your own relationships instead of
the bundled sample data, you get your data into Splunk the normal way,
shaped to the schema GraphLens expects. This guide walks through that,
end to end. For the full field reference, see DATA_MODEL.md; for the
one-time sample-data load, see INSTALL.md section 4.

There are two separate things to populate:

| What | Where it lives | Changes over time? |
|---|---|---|
| Relationships (edges) | A Splunk index, as events | Yes - time-series, re-queried on every search/expand |
| Type display config (colours, icons, enabled flags) | KV Store collections | No - static, curated once |

## 1. Shape your relationship data

Each relationship needs to exist as one event in your configured index
(default `graphlens_relationships`), sourcetype `graphlens:relationship`,
with these fields:

```
edge_id, source_id, source_type, source_label,
target_id, target_type, target_label,
relationship_type, relationship_label,
event_count, first_seen, last_seen, risk_score,
source_index, source_sourcetype, evidence_reference
```

Notes:

- `source_id` / `target_id` are namespaced, stable identifiers (e.g.
  `user:jsmith`, `host:server01.example.com`) and must match
  `^[A-Za-z0-9][A-Za-z0-9:_\-.@/]{0,254}$` - no quotes, backslashes,
  pipes, wildcards, spaces, or control characters.
- `source_type` / `target_type` are short type tokens (`user`, `host`,
  `ip`, ...) that you will later register in `graphlens_node_types`.
- `relationship_type` is a short type token (`AUTHENTICATED_TO`, ...)
  that you will register in `graphlens_relationship_types`.
- `edge_id` can be omitted - GraphLens derives one deterministically from
  `source_id` + `target_id` + `relationship_type` if it's missing.
- `source_index` / `source_sourcetype` should point at the *original*
  data this relationship was derived from (not necessarily
  `graphlens_relationships` itself) - they drive the "View supporting
  events" evidence lookup.
- `evidence_reference` is only needed if you want evidence lookups to
  work for this edge (see section 4).

See `sample_data/graphlens_relationships_sample.csv` for a complete,
concrete example set, and the full field table in DATA_MODEL.md.

## 2. Get those events into the index

Pick whichever of these matches how your source data already exists in
Splunk:

**A. You already have raw events that imply relationships** (auth logs,
process trees, network flows, CMDB exports, etc.) - this is the normal
long-term pattern. Write a scheduled search that transforms your existing
events into the edge schema above and writes them out, e.g.:

```spl
index=your_auth_logs action=success
| stats count as event_count min(_time) as first_seen max(_time) as last_seen
    by src_user dest_host
| eval source_id="user:".src_user,
       source_type="user",
       source_label=src_user,
       target_id="host:".dest_host,
       target_type="host",
       target_label=dest_host,
       relationship_type="AUTHENTICATED_TO",
       relationship_label="Authenticated to",
       source_index="your_auth_logs",
       source_sourcetype="your:sourcetype",
       risk_score=0
| collect index=graphlens_relationships sourcetype=graphlens:relationship
```

Schedule it (hourly/daily, whatever matches how fresh you need the graph
to be) via `savedsearches.conf` or the Search app's scheduler UI. This is
where your own domain logic belongs - GraphLens never assumes how your
relationships are derived.

**B. You have a one-off file** (CSV, like the bundled sample) already
shaped to the schema:

```
splunk add oneshot <file> -index graphlens_relationships -sourcetype graphlens:relationship
```

or Splunk Web > **Settings > Add Data > Upload**. On Splunk Cloud, use
your normal supported one-time upload path (Cloud Monitoring Console
upload workflow, or a HEC-based loader you already operate).

**C. Live/streaming source** - POST events shaped to the schema to your
HTTP Event Collector (HEC) token configured for the
`graphlens_relationships` index / `graphlens:relationship` sourcetype.

The index itself is not created automatically - create it first (see
INSTALL.md section 3) with a name matching whatever you set in the
Configuration page's **Relationship index** field.

**D. No index at all - read directly from a lookup.** If your
relationship data is better maintained as a lookup table (a CMDB export, a
curated CSV, anything that is not naturally time-series) than as indexed
events, you can skip indexing entirely:

1. Create or upload a CSV lookup table file with the same columns as the
   index schema above (`source_id`, `target_id`, `relationship_type`, etc.
   - `edge_id`/`event_count`/`first_seen`/`last_seen` can be omitted or
   left blank; see DATA_MODEL.md). Splunk Web's **Lookup table files**
   page, or `| makeresults | ... | outputlookup <name>.csv`, both work.
2. **Give it a lookup definition** (Settings > Lookups > **Lookup table
   definitions** > New, type "File-based"), pointing at that file, with a
   name of your choosing (no `.csv` extension or dots - the same identifier
   grammar as an index name). This step is easy to miss and is required:
   confirmed against a live instance, `| inputlookup <name>` (no extension)
   fails with "requires a .csv or KV store lookup definition" unless a
   lookup *definition* with that exact name exists - the raw uploaded
   file's name alone is not enough, and GraphLens's own validation
   (`LOOKUP_NAME_PATTERN`, see SECURITY.md) rejects a name containing a dot
   in the Configuration page anyway, which makes a bare `.csv` filename
   impossible to configure here even if Splunk would otherwise accept it.
3. In the Configuration page, set **Relationship data source** to
   **Lookup (static table)** and **Relationship lookup** to that
   definition's name (not the uploaded file's name, if they differ).
4. That's it - no index, no scheduled search, no HEC. GraphLens reads it
   with `| inputlookup <name>` the same way it reads an index with
   `search index=<name>`, for every entity search and expansion.

This is the lightest-weight way to try GraphLens against your own data: no
ingestion pipeline, no scheduled search to maintain, just a table you edit
directly. The tradeoff is that a lookup is a plain snapshot, not a
time-series - `first_seen`/`last_seen`/`event_count` only reflect whatever
values you put in the table yourself, and the toolbar's time range
selector has no effect on which rows are returned (a lookup has no event
time to filter by unless you give it one). Switch to index mode (option A)
once you want genuinely time-bounded, continuously-updated relationship
data.

**E. No index and no lookup - read directly from a saved search you
already wrote.** If your relationship data is better expressed as an
already-authored search - a join across several indexes, a data model
search, a transforming search over a CMDB you already have a working
query for - than as either a single index or a single static table, you
can point GraphLens at that search instead of recreating it as a lookup:

1. Author (or reuse) a saved search whose results are already shaped to
   the relationship schema above - the same columns an index event or a
   lookup row needs (`source_id`, `target_id`, `relationship_type`, etc.;
   `edge_id`/`event_count`/`first_seen`/`last_seen` can be omitted or left
   blank - see DATA_MODEL.md). GraphLens runs it with `| savedsearch
   "<name>"` and applies no transformation of its own, so its results must
   already match.
2. In the Configuration page, set **Relationship data source** to
   **Saved search (pre-authored results)** and **Relationship saved
   search** to that search's name. **Both of these require the
   `graphlens_use_search_source` capability**, which is deliberately not
   granted to any example role by default - see SECURITY.md, "Saved
   search as a relationship data source," before using this option: unlike
   an index or a lookup, GraphLens does not review a saved search's
   content, so whoever can author or edit it effectively controls what
   data appears in the graph.
3. That's it - no new index, no lookup definition, no HEC. GraphLens reads
   it with `| savedsearch "<name>"` the same way it reads an index with
   `search index=<name>` or a lookup with `| inputlookup <name>`, for
   every entity search and expansion.

This is the right choice when the shape of your relationship data is
already the hard part solved, and the remaining work is just telling
GraphLens where to find it - but it does mean the data an administrator
sees in the graph is only as trustworthy as whoever last edited that
saved search, which is exactly why this one option is gated by its own
capability rather than sharing `graphlens_manage_config` with every other
setting on this page.

## 3. Register your types

Node/relationship type colours, icons, shapes, and enabled flags live in
KV Store, separately from the index data, and are curated once (not
time-series). Seed them from the bundled starting points and then edit to
match the types you actually used above:

```spl
| inputlookup graphlens_sample_node_types | outputlookup graphlens_node_types
| inputlookup graphlens_sample_relationship_types | outputlookup graphlens_relationship_types
```

Requires the `graphlens_manage_collections` capability (see ADMIN_GUIDE.md).
Any `source_type`/`target_type`/`relationship_type` value that isn't
registered here still renders (with a default colour/shape) - registering
it just controls how it's displayed in the legend and filters.

**Trying out GraphLens before bringing in your own data?** The
Configuration page's "Load demo data" button runs the two lines above for
you, plus loads a small bundled set of sample relationships into whichever
`relationship_source_type` you've configured (an index or a lookup) - see
CONFIGURATION.md's "Demo data" section. It is not a substitute for the
steps in this document; it exists so you can see GraphLens working end to
end before doing them for your own data.

## 4. Wire up evidence (optional)

If you want **View supporting events** to work for an edge, the raw
events it should surface need their own `evidence_reference` field with
a value matching that edge's `evidence_reference`, and must live in the
index/sourcetype named in that edge's `source_index`/`source_sourcetype`.
See `sample_data/graphlens_evidence_sample.csv` for a worked example, and
`shared/services/evidenceQueryBuilder.js` for exactly how the lookup is
built (it's a single bounded, pre-approved search - never free-form SPL).

Node evidence (rather than edge evidence) instead uses a per-node-type
field heuristic (e.g. `user` -> `src_user`) matched against the node's own
label - see DATA_MODEL.md, "Evidence / supporting events".

## 5. Curate static nodes/edges (optional)

If some nodes or edges are better hand-maintained than derived from
events (e.g. a CMDB-sourced asset, a manually tracked relationship),
write them directly into the `graphlens_nodes` / `graphlens_edges` KV
Store collections instead of indexing them as events. These are merged in
by the node/edge-details templates alongside indexed data. Requires
`graphlens_admin`.

## Checklist

- [ ] Index created, named to match the Configuration page's
      **Relationship index** setting
- [ ] A search (scheduled, one-shot, or HEC) is producing events in that
      index with sourcetype `graphlens:relationship` and all required
      fields from DATA_MODEL.md
- [ ] `graphlens_node_types` / `graphlens_relationship_types` KV Store
      collections reflect the types your data actually uses
- [ ] (Optional) `evidence_reference` wired up for edges you want
      drill-down evidence on
- [ ] Searched for a known entity in the Relationship Explorer and
      confirmed it appears and expands as expected
