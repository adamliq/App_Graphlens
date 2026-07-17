# User guide

GraphLens provides an interactive, node-and-edge relationship graph over
data already in Splunk. It is not a general-purpose graph database query
tool - every action you take runs one of a small set of bounded, approved
searches (see ARCHITECTURE.md) within your own Splunk permissions.

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
- **Fit to screen**: toolbar button - frames the whole visible graph.
- **Centre selected**: toolbar button - pans/zooms to the selected node.
- **Change layout**: toolbar dropdown (cose, concentric, breadthfirst,
  circle, grid). **Recalculate layout** re-runs the current layout without
  changing which layout is selected.

## Filters

Left-hand panel:

- **Node types** / **Relationship types**: checkboxes to hide specific
  types from view (data stays loaded; only the display is filtered).
- **Risk & frequency**: minimum/maximum risk score and minimum event count.
- **Time range**: toolbar dropdown - changes the time window used by
  subsequent searches (expansion, entity search). Changing it does not
  retroactively re-run past expansions.

## Legend

The left-hand panel legend shows the colour used for each node type and
relationship type currently present in your graph.

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

## Export

Toolbar **Export** button. Choose:

- **JSON (graph)** - full node/edge data plus export metadata (time,
  filters, counts).
- **CSV (nodes)** / **CSV (edges)** - flat tables.
- **PNG (image)** - a snapshot of the current canvas.

Exports only ever include what is currently visible to you (data your own
searches already returned); sanitisation prevents exported labels from
carrying spreadsheet-formula-injection payloads.

## Graph limits

If you see a banner reading "Graph size limit reached", the graph has hit
an administrator-configured maximum (default 1000 nodes / 2500 edges).
Narrow your time range or filters, or ask an administrator to raise the
limit in the Configuration page.

## Resetting

Toolbar **Reset graph** clears everything and returns you to the empty
state, ready for a new search.
