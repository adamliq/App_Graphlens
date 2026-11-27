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
- **Graph / Table**: toolbar buttons. Graph is the usual interactive
  canvas; Table shows the identical, already-filtered set of nodes and
  relationships as two plain tables instead - useful for scanning or
  copying values you can't easily read off the canvas. It's read-only:
  switch back to Graph to select, expand, pin, or hide anything. The
  other toolbar buttons below (layout, Fit to screen, Centre selected)
  only apply to the Graph view and are disabled while Table is shown.
- **Fit to screen**: toolbar icon button (four outward arrows; hover for
  its name) - frames the whole visible graph. A very small graph is not
  zoomed in beyond 1.75x, so one or two nodes are not blown up to fill
  the screen.
- **Centre selected**: toolbar icon button (hover for its name) -
  pans/zooms to the selected node.
- **Change layout**: toolbar **Layout** dropdown (cose, concentric,
  breadthfirst, circle, grid). **Recalculate layout** (the circular-arrow
  icon button beside it) re-runs the current layout without changing
  which layout is selected.
- **Toolbar groups** (1.23.0): find (search, time range) | view (Graph/
  Table, layout and the three view icon buttons) | data (Import, Export,
  Load from job), with **Reset graph** on the far right.
- **Left sidebar sections** (1.23.0) collapse and expand by clicking
  their heading. Node types, Relationship types, Risk & frequency, Time
  window and Legend start open; Colours, Path finder, Query and Saved
  views start collapsed. Your choice is remembered in this browser.
  Choosing **Use as path endpoint** opens the Path finder section
  automatically.
- **Select several nodes at once**: hold **Shift** and drag a box around
  them, or click a node type in the legend to select every currently
  visible node of that type. An ordinary click-and-drag still pans the
  canvas exactly as before - only a Shift-drag draws a selection box.
  With more than one node selected, the details panel is replaced by
  **bulk actions**: Pin all, Unpin all, Hide all, Expand all, or Clear
  selection - each one is exactly the same action a single node already
  has, just applied to every selected node at once.
- **Right-click a node** (1.20.0): opens a context menu with the same
  actions the details panel already offers for that node - Expand/
  Collapse, Pin/Unpin, Hide, Centre on screen, View supporting events,
  Use as path endpoint - without leaving the canvas or scrolling to the
  details panel first. Right-clicking also selects the node, so the
  details panel updates to match.
- **Right-click a relationship** (1.21.0): opens a smaller context menu
  with **View supporting events** - the one action the details panel
  offers for a relationship beyond editing it. Right-clicking empty
  canvas shows no menu either way.

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

Toolbar **Import** button accepts either of two file shapes, detected
automatically (by file extension, falling back to content if neither
matches), replacing whatever graph is currently shown. If the canvas
already has anything on it, clicking Import first asks you to confirm
(1.21.0) before the file picker even opens - Cancel to keep what's on
screen:

- A **JSON** file previously produced by **Export > JSON (graph)** - a
  convenience for resuming or sharing a specific graph snapshot. This is
  not a way to bring your own Splunk data into GraphLens (see
  DATA_INGESTION.md for that).
- A **CSV** file already shaped to the relationship schema (see the Help
  page) - the same schema an index, lookup, saved search, Table Dataset
  or Load from job already produces, and the one the bundled sample data
  ships as (`lookups/graphlens_sample_relationships.csv`). This *is* a
  way to bring your own data in, as a one-off, without touching the
  Configuration page or any Splunk-side setup at all. Rows matching
  neither a node row (`node_id`) nor an edge row (`source_id`+
  `target_id`+`relationship_type`) are silently skipped.

The file is read entirely in your browser; nothing is uploaded anywhere.
Every node and edge in the file is re-validated exactly the same way a
live search result would be (invalid identifiers are silently dropped,
control characters are stripped from labels) - an import can never add anything GraphLens
would not otherwise accept. The **exported** CSV files (nodes/edges) are
still one-way and cannot be imported back: they are two separate flat
tables with different column names (`id`/`source`/`target`/...) than
the relationship schema above, and do not round-trip the full
node/edge/metadata structure JSON does.

If your role has the `graphlens_edit_graph_data` capability (1.19.0),
picking a CSV file opens a **review table** first instead of loading it
straight onto the canvas: fix any cell (a typo'd risk score, a wrong
label) right there, then click **Load**. This only changes what gets
loaded, never the file on disk. Only the first 200 rows are shown for
editing; any further rows still load, just unedited.

## Editing a node or relationship

If your role has the `graphlens_edit_graph_data` capability (1.19.0),
the Details panel for a selected node or relationship shows an **Edit**
button alongside its usual actions. Edit mode lets you change its label,
type, risk score, event count, and a few other fields, then **Save** or
**Cancel**. An edit only changes what you see in this browser session -
it is never sent to Splunk, never seen by anyone else, and is lost the
moment you Reset graph or reload the page. If you want to keep a
correction, re-export (CSV/JSON) afterward. If you make a mistake, a
banner reading **Edited "&lt;name&gt;"** appears with an **Undo** button
(1.21.0) - it reverts that one edit back to what it was just before you
saved. Only your single most recent edit can be undone this way (making
another edit, or Dismissing the banner, clears it); it is lost on Reset
graph or a reload, same as the edit itself, and on anything else that
replaces the graph. Once you have made an edit, picking a search result,
loading a query result onto the canvas or loading a saved view asks you
to confirm first (**Discard your edits?**, 1.22.0); without an edit they
run straight away. Text is kept exactly as you type it - "AT&T" stays
"AT&T" however many times you save it (before 1.22.0 it was shown as
"AT&amp;T").

## Load from job

Toolbar **Load from job** button: paste the job ID (sid) of a search you
(or someone who shared it with you) already ran - in Splunk Web's own
Search app, for example - and GraphLens loads that job's results onto
the canvas, replacing whatever graph is currently shown. This does not
run a new search; it only reads a job that already exists, so it can
never show you anything that job's own search permissions wouldn't
already have let you see. The job's results must already be shaped to
the relationship schema (see the Help page) - a one-hop expansion's edge
rows, a plain entity list's node rows, or a mix of both; rows matching
neither shape are silently skipped. A job only exists for a limited time
after it finishes (a few minutes by Splunk's own default, unless it has
been pinned or scheduled), so this only works while it still does. Every
row is re-validated exactly the same way a live search result would be
(invalid identifiers are silently dropped, control characters are
stripped from labels) - it
can never add anything GraphLens would not otherwise accept. If the
canvas already has anything on it, opening **Load from job** first asks
you to confirm (1.21.0), same as Import.

## Graph limits

If you see a banner reading "Graph size limit reached", the graph has hit
an administrator-configured maximum (default 1000 nodes / 2500 edges).
Narrow your time range or filters, or ask an administrator to raise the
limit in the Configuration page.

## Resetting

Toolbar **Reset graph** clears everything and returns you to the empty
state, ready for a new search. If the canvas already has anything on
it, it first asks you to confirm (1.21.0) - Cancel to keep what's on
screen. On an already-empty canvas it clears immediately, with no
confirmation to click through.
