import React from 'react';
import PageNav from '../../shared/components/PageNav';

const APP_VERSION = '1.2.0';

/**
 * Static, no-dependency reference page - unlike the other three pages,
 * this one dispatches no searches and checks no capability, so every
 * user who can open the app at all can read it. Content mirrors
 * USER_GUIDE.md, condensed for in-app reading; USER_GUIDE.md remains the
 * authoritative, fuller version (not shipped as a web page itself).
 */
export default function App() {
  return (
    <div style={{ padding: 24, maxWidth: 760 }}>
      <PageNav activeTabId="graphlens_help" />
      <h1>GraphLens help</h1>
      <p>
        GraphLens is an interactive, node-and-edge relationship graph over data
        already in Splunk. It is not a general-purpose graph database query tool -
        every action you take runs one of a small set of bounded, approved
        searches within your own Splunk permissions.
      </p>

      <section className="graphlens-section">
        <h2>Getting started</h2>
        <ol>
          <li>Open the <strong>Relationship Explorer</strong> page.</li>
          <li>
            Type a search term in the entity search box (top left) and press
            Enter or click <strong>Search</strong> - e.g. a username, hostname,
            or IP address.
          </li>
          <li>Pick a matching entity from the dropdown. It appears as a single node on the canvas.</li>
          <li>
            <strong>Double-click the node</strong> (or select it and click
            <strong> Expand</strong> in the details panel) to reveal its
            directly related nodes, one hop out.
          </li>
          <li>
            Continue expanding nodes you are interested in. Only what you
            expand is ever loaded - the whole dataset is never pulled into the
            browser.
          </li>
        </ol>
      </section>

      <section className="graphlens-section">
        <h2>Interacting with the graph</h2>
        <ul>
          <li><strong>Select</strong> a node or edge: single-click it to see its properties in the details panel.</li>
          <li><strong>Expand</strong>: double-click a node, or use the Expand button.</li>
          <li><strong>Collapse</strong>: select a node and click Collapse. Nodes only reachable through that expansion disappear; pinned/selected/still-reachable nodes are kept.</li>
          <li><strong>Hide</strong>: select and click Hide. It leaves the view but stays part of the graph&apos;s state.</li>
          <li><strong>Pin / unpin</strong>: keeps a node visible even if the expansion that introduced it is later collapsed.</li>
          <li><strong>Zoom / pan</strong>: mouse wheel / drag.</li>
          <li><strong>Fit to screen</strong> / <strong>Centre selected</strong>: toolbar buttons.</li>
          <li><strong>Change layout</strong>: toolbar dropdown. Recalculate layout re-runs the current layout.</li>
        </ul>
      </section>

      <section className="graphlens-section">
        <h2>Filters and legend</h2>
        <p>
          The left-hand panel lets you hide specific node/relationship types
          (data stays loaded, only the display is filtered), set a minimum/
          maximum risk score and minimum event count, and shows a colour
          legend for every type currently present in your graph. The toolbar&apos;s
          time range dropdown changes the window used by subsequent searches
          (it does not retroactively re-run past expansions).
        </p>
      </section>

      <section className="graphlens-section">
        <h2>Viewing supporting events</h2>
        <p>
          Select a node or edge, then click <strong>View supporting events</strong>.
          GraphLens runs a single, bounded, pre-approved search (never your own
          free-form SPL) against the index/sourcetype that produced the
          relationship, and shows the matching raw events in the bottom panel -
          never data outside your own Splunk search permissions.
        </p>
      </section>

      <section className="graphlens-section">
        <h2>Path finder</h2>
        <p>
          In the left-hand panel, choose a start and end node from the
          currently <em>visible</em> graph and click <strong>Find shortest path</strong>.
          This highlights the shortest route using only edges already loaded
          in your browser - a convenience for visually tracing a connection,
          not an unrestricted graph-database traversal. If the two nodes
          aren&apos;t connected within what you&apos;ve expanded so far, expand more and
          try again.
        </p>
      </section>

      <section className="graphlens-section">
        <h2>Export</h2>
        <p>
          Toolbar <strong>Export</strong> button: JSON (full graph data plus
          metadata), CSV (nodes or edges), or PNG (canvas snapshot). Exports
          only ever include what is currently visible to you.
        </p>
      </section>

      <section className="graphlens-section">
        <h2>Graph limits</h2>
        <p>
          A &quot;Graph size limit reached&quot; banner means the graph has hit an
          administrator-configured maximum (see the Configuration page).
          Narrow your time range or filters, or ask an administrator to raise
          the limit.
        </p>
      </section>

      <section className="graphlens-section">
        <h2>Resetting</h2>
        <p>Toolbar <strong>Reset graph</strong> clears everything and returns you to the empty state.</p>
      </section>

      <p style={{ fontSize: 12, color: '#5c5c5c' }}>
        GraphLens {APP_VERSION}. For the full reference (data model, admin
        guide, security model), see this app&apos;s documentation files in its
        installed package.
      </p>
    </div>
  );
}
