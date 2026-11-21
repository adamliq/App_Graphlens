import React from 'react';
import PageNav from '../../shared/components/PageNav';

const APP_VERSION = '1.7.3';

/**
 * Static, no-dependency reference page - unlike the other three pages,
 * this one dispatches no searches and checks no capability, so every
 * user who can open the app at all can read it. Content mirrors
 * USER_GUIDE.md, DATA_INGESTION.md, CONFIGURATION.md and SECURITY.md,
 * condensed for in-app reading; those files remain the authoritative,
 * fuller versions (shipped in the installed package, not as web pages
 * themselves).
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
          legend for every type currently present in your graph - guaranteed
          distinct for whatever types are on screen at once. An
          <strong> Indicators</strong> section below it explains the
          canvas&apos;s other colour cues, which are independent of type
          colour and never hide each other: a red halo for risk score 70+
          (stays visible regardless of selection/pin state), a blue double
          border for pinned, an orange border for selected, and a dashed
          green border for a node on a highlighted path. The toolbar&apos;s
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
        <h2>Query language</h2>
        <p>
          The left-hand panel&apos;s <strong>Query</strong> section lets you
          describe a starting node and which of its relationships to follow
          in one GraphQL-like request, e.g.{' '}
          <code>{'{ node(search: "alice") { id FRIEND_OF(direction: OUTGOING) { id } } }'}</code>.
          Click <strong>Run query</strong>, then <strong>Load onto
          canvas</strong> to replace the current graph with the result - the
          same way importing a file does. It is not an unrestricted
          graph-database query console: every query compiles down to the
          same bounded, pre-approved searches every other action in
          GraphLens uses, within your own Splunk permissions, bounded by
          the administrator&apos;s configured maximum expansion depth and
          an overall search budget. See USER_GUIDE.md in the installed
          package for the full syntax reference.
        </p>
      </section>

      <section className="graphlens-section">
        <h2>Export and import</h2>
        <p>
          Toolbar <strong>Export</strong> button: JSON (full graph data plus
          metadata), CSV (nodes or edges), or PNG (canvas snapshot). Exports
          only ever include what is currently visible to you. Toolbar
          <strong> Import</strong> button: pick a previously exported JSON
          file to load it back onto the canvas, replacing the current
          graph - a convenience for resuming or sharing a specific
          snapshot, read entirely in your browser (nothing is uploaded).
          It is not a way to bring your own Splunk data into GraphLens -
          see &quot;Loading your own data&quot; below for that. Every
          imported node and edge is re-validated the same way a live
          search result would be, so an import can never add anything
          GraphLens would not otherwise accept.
        </p>
      </section>

      <section className="graphlens-section">
        <h2>Where the relationship data comes from</h2>
        <p>
          An administrator chooses, on the Configuration page, whether
          searches and expansions read observed relationships from a Splunk
          <strong> index</strong> (the normal, time-series choice, updated by
          an ingestion pipeline or scheduled search) or directly from a
          <strong> lookup table</strong> (a static, hand- or script-maintained
          table - no ingestion pipeline required). This only changes where
          the data comes from, not how you use GraphLens - searching,
          expanding, filtering, and exporting all work the same either way.
          One difference to know about: in lookup mode, the toolbar&apos;s time
          range has no effect, since a lookup is a snapshot with no event
          time to filter by.
        </p>
      </section>

      <section className="graphlens-section">
        <h2>Loading your own data</h2>
        <p>
          GraphLens is a visualization layer over data already in Splunk -
          it has no file-upload feature of its own. Relationships are
          brought in shaped to GraphLens&apos;s schema (<code>source_id</code>,
          <code> target_id</code>, <code>relationship_type</code>, and so
          on - see DATA_MODEL.md), either as indexed events (via a
          scheduled search transforming existing events, a one-off file
          upload, or a live HTTP Event Collector source) or, with no index
          at all, as a lookup table in lookup mode (see above). Either way,
          afterwards you register your node/relationship types in the
          <code> graphlens_node_types</code> / <code>graphlens_relationship_types</code>
          {' '}KV Store collections - an unregistered type still renders,
          with a default colour - and optionally wire up
          <code> evidence_reference</code> so <strong>View supporting
          events</strong> works for an edge. See DATA_INGESTION.md in the
          installed package for the complete, step-by-step guide.
        </p>
      </section>

      <section className="graphlens-section">
        <h2>Administrator settings</h2>
        <p>
          The Configuration page (requires the
          <code> graphlens_manage_config</code> capability) controls graph
          limits (max visible nodes/edges, max expansion neighbours/depth,
          max path-finder depth, max search result rows, search dispatch
          timeout), search defaults (relationship data source and name,
          default evidence index, default time range), feature toggles
          (export, annotations, saved views, clustering, path finder, query
          language), and
          an optional node/relationship type allowlist plus the layouts
          and export formats offered in the UI. Settings live in
          <code> graphlens_settings.conf</code>; the Configuration page
          writes your changes to <code>local/graphlens_settings.conf</code>
          {' '}through Splunk&apos;s standard configuration REST endpoint - the
          shipped <code>default/</code> copy is replaced on every upgrade,
          so never edit it directly. See CONFIGURATION.md in the installed
          package for the full settings reference, plus upgrade and
          rollback notes.
        </p>
      </section>

      <section className="graphlens-section">
        <h2>Security model</h2>
        <p>
          GraphLens adds no credential store and no external network
          dependency of its own - every action goes through Splunk&apos;s own
          REST APIs, using your current session. Splunk&apos;s own
          role-based access control, not GraphLens&apos;s UI, is the actual
          security boundary: hiding or disabling a button for your role is
          a convenience, not what keeps you from seeing data your role
          could not already search. Every value that reaches a search
          (search terms, identifiers, index/lookup names, limits) is
          validated or escaped first - GraphLens never accepts or runs
          free-form SPL. Every tracked action (search, expansion, evidence
          view, export, annotation, configuration change) is recorded in
          the audit log (see the Health page), with actor/action/outcome
          only - never credentials or raw event content. See SECURITY.md
          in the installed package for the complete security model,
          including the full access-control capability list and known
          limitations.
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
        GraphLens {APP_VERSION}. The sections above condense
        DATA_INGESTION.md, CONFIGURATION.md and SECURITY.md; for those in
        full, plus the data model and admin guide, see this app&apos;s
        documentation files in its installed package.
      </p>
    </div>
  );
}
