# User guide

GraphLens provides an interactive, node-and-edge relationship graph over
data already in Splunk. It is not a general-purpose graph database query
tool - every action you take runs one of a small set of bounded, approved
searches (see ARCHITECTURE.md) within your own Splunk permissions.

A condensed version of this guide is also available in-app, on the
**Help** page (reachable from any GraphLens page's nav tabs) - this
document remains the fuller, authoritative version.

## Getting started

1. Open the **Relationship Explorer** page.
2. Type a search term in the entity search box (top left) and press Enter
   or click **Search** - e.g. a username, hostname, or IP address.
3. Pick a matching entity from the dropdown. It appears as a single node
   on the canvas.
4. **Double-click the node** (or select it and click **Expand** in the
   details panel) to reveal its directly related nodes, one hop out.
5. Continue expanding nodes you are interested in. Only what you expand is
   ever loaded - the whole dataset is never pulled into the browser.

## Interacting with the graph

- **Select a node or edge**: single-click it. Its properties appear in the
  right-hand details panel.
- **Expand a node**: double-click it, or use the **Expand** button in the
  details panel.
- **Collapse a node**: select it and click **Collapse**. Nodes that were
  only reachable through that expansion disappear; nodes still reachable
  through another expansion, pinned nodes, and the currently selected node
  are kept.
- **Hide a node**: select it and click **Hide**. It disappears from view
  but stays part of the graph's underlying state (unhide it again through
  filters, or **Reset graph** to start over).
- **Pin / unpin a node**: keeps a node visible even if the expansion that
  introduced it is later collapsed. Pinned nodes have a double border.
- **Zoom / pan**: mouse wheel / drag, standard Cytoscape.js interaction.
- **Diagram / Text**: toolbar buttons. Diagram is the usual interactive
  canvas; Text shows the identical, already-filtered set of nodes and
  relationships as two plain tables instead - useful for scanning or
  copying values you can't easily read off the canvas. It's read-only:
  switch back to Diagram to select, expand, pin, or hide anything. The
  other toolbar buttons below (layout, Fit to screen, Centre selected)
  only apply to the Diagram view and are disabled while Text is shown.
- **Fit to screen**: toolbar button - frames the whole visible graph.
- **Centre selected**: toolbar button - pans/zooms to the selected node.
- **Change layout**: toolbar dropdown (cose, concentric, breadthfirst,
  circle, grid). **Recalculate layout** re-runs the current layout without
  changing which layout is selected.
- **Select several nodes at once**: hold **Shift** and drag a box around
  them, or click a node type in the legend to select every currently
  visible node of that type. An ordinary click-and-drag still pans the
  canvas exactly as before - only a Shift-drag draws a selection box.
  With more than one node selected, the details panel is replaced by
  **bulk actions**: Pin all, Unpin all, Hide all, Expand all, or Clear
  selection - each one is exactly the same action a single node already
  has, just applied to every selected node at once.

## Filters

Left-hand panel:

- **Node types** / **Relationship types**: checkboxes to hide specific
  types from view (data stays loaded; only the display is filtered).
- **Risk & frequency**: minimum/maximum risk score and minimum event count.
- **Time window** (the "time slicer"): two sliders bounding which nodes/
  edges are shown, by their own first-seen/last-seen span, to whatever
  range is currently loaded. This is separate from, and does not change,
  the toolbar's time range below - it only hides elements already
  fetched, the same way the Risk filter does, rather than re-running any
  search. Click **Reset window** to go back to showing everything loaded.
- **Time range**: toolbar dropdown - changes the time window used by
  subsequent searches (expansion, entity search). Changing it does not
  retroactively re-run past expansions.

## Legend

The left-hand panel legend shows the colour used for each node type and
relationship type currently present in your graph - guaranteed distinct
for whatever types are on screen at once, even without any administrator
curation. Click a node type to select every visible node of that type
(see "Select several nodes at once" above). An **Indicators** section
below it explains the canvas's other colour cues, which are independent
of type colour: a red halo for a risk score of 70 or higher (stays
visible no matter what else is true of the node), a blue double border
for pinned, an orange border for selected, and a dashed green border for
a node on a highlighted path.

## Colours (this session only)

The left-hand panel's colour override section lets you pick a different
colour for a node or relationship type, for this browser tab only - it
is never written anywhere, never visible to anyone else, and gone the
moment you reload the page. Use it to make something stand out while
you are looking at it; it does not change the curated colours an
administrator has set up (see CONFIGURATION.md), which are still what
everyone else - and you, after a reload - will see.

## Viewing supporting events (evidence)

Select a node or edge, then click **View supporting events**. GraphLens
runs a single, bounded, pre-approved search (never your own free-form SPL)
against the index/sourcetype that produced the relationship, and shows the
matching raw events in the bottom panel. This never shows you data outside
your own Splunk search permissions.

## Path finder

In the left-hand panel, choose a start and end node from the currently
*visible* graph and click **Find shortest path**. GraphLens highlights the
shortest route between them using only edges already loaded in your
browser. This is a convenience for visually tracing a connection, not an
unrestricted graph-database traversal - if the two nodes aren't connected
within what you have expanded so far (and within the administrator's
configured maximum path depth), expand more of the graph and try again.

## Query language

In the left-hand panel's **Query** section, you can describe a starting
node and which of its relationships to follow in a single GraphQL-like
request, instead of searching and clicking Expand repeatedly. For example:

```
{
  node(search: "alice") {
    id
    label
    riskScore
    FRIEND_OF(direction: OUTGOING, limit: 10) {
      id
      label
      LOGGED_IN {
        id
        label
      }
    }
  }
}
```

This starts from whatever matches "alice" (the same search the toolbar's
entity search box runs), then follows up to 10 outgoing `FRIEND_OF`
relationships from it, and in turn follows each of *those* nodes'
`LOGGED_IN` relationships. You can also start from a known node id instead
of a search term: `node(id: "user:jsmith") { ... }`.

A few things worth knowing:

- Every field inside `node { ... }` is either a **property** - one of
  `id`, `label`, `type`, `group`, `description`, `riskScore`,
  `eventCount`, `firstSeen`, `lastSeen`, `sourceIndex`,
  `sourceSourcetype` - or a **relationship to follow**, written as a
  field with its own `{ ... }` whose name matches a relationship type
  (case-insensitive). If a relationship type isn't a convenient field
  name, give the field any name you like and add `type: "the_real_name"`.
- `direction: OUTGOING`, `INCOMING` or `BOTH` (the default) on a
  relationship field controls which end of the relationship the current
  node must be on. `limit` bounds how many of that relationship it
  follows.
- Click **Run query** to execute it, then **Load onto canvas** to replace
  the current graph with the result - the same way importing a file does.
  The panel also shows a JSON preview of what was found.
- This is not an unrestricted graph-database query console: it compiles
  down to the same bounded, pre-approved searches every other action in
  GraphLens uses, within your own Splunk search permissions (see
  SECURITY.md), and is subject to the administrator-configured maximum
  expansion depth and a fixed overall search budget - a very broad query
  may come back noting its result was truncated. See
  KNOWN_LIMITATIONS.md for the full list of what the syntax does not
  support (fragments, variables, aliases, and a few others).

## Saved views

The left-hand panel's **Saved views** section lets you name and save the
graph you are currently looking at - which node you started from and
which of its neighbours you have expanded - and come back to it later,
privately. Give it a name (and an optional description) and click
**Save current view**; click **Load** on any saved view to replace the
current graph with it. Loading a view re-runs the same searches a live
exploration would, so you see current data for the same nodes rather
than a frozen picture from when you saved it - if you want an exact,
unchanging copy instead, use Export. A saved view only works for a graph
that started from a single search result; one built via Import or the
query panel's "Load onto canvas" cannot be saved this way (see
KNOWN_LIMITATIONS.md). Saved views are visible only to you.

## Export

Toolbar **Export** button. Choose:

- **JSON (graph)** - full node/edge data plus export metadata (time,
  filters, counts).
- **CSV (nodes)** / **CSV (edges)** - flat tables.
- **PNG (image)** - a snapshot of the current canvas.

Exports only ever include what is currently visible to you (data your own
searches already returned); sanitisation prevents exported labels from
carrying spreadsheet-formula-injection payloads.

## Import

Toolbar **Import** button: pick a JSON file previously produced by
**Export > JSON (graph)** and GraphLens loads it back onto the canvas,
replacing whatever graph is currently shown. This is a convenience for
resuming or sharing a specific graph snapshot - it is not a way to bring
your own Splunk data into GraphLens (see DATA_INGESTION.md for that). The
file is read entirely in your browser; nothing is uploaded anywhere. Every
node and edge in the file is re-validated exactly the same way a live
search result would be (invalid identifiers are silently dropped, labels
are HTML-escaped) - an import can never add anything GraphLens would not
otherwise accept. Only CSV/PNG exports are one-way; CSV cannot be
imported back, since it is a flat table and does not round-trip the
node/edge/metadata structure JSON does.

## Graph limits

If you see a banner reading "Graph size limit reached", the graph has hit
an administrator-configured maximum (default 1000 nodes / 2500 edges).
Narrow your time range or filters, or ask an administrator to raise the
limit in the Configuration page.

## Resetting

Toolbar **Reset graph** clears everything and returns you to the empty
state, ready for a new search.
