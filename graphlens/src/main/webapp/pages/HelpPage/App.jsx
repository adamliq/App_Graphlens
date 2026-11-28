import React from 'react';
import PageNav from '../../shared/components/PageNav';

const APP_VERSION = '1.24.1';

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
          <li>
            <strong>Graph / Table</strong>: toolbar buttons. Table shows the
            same, already-filtered nodes and relationships as two plain
            tables instead of the canvas - read-only; switch back to Graph
            to interact with the graph again.
          </li>
          <li><strong>Fit to screen</strong> / <strong>Centre selected</strong>: toolbar icon buttons - hover for their names.</li>
          <li><strong>Change layout</strong>: toolbar <strong>Layout</strong> dropdown. The circular-arrow icon button beside it (Recalculate layout) re-runs the current layout.</li>
          <li><strong>Sidebar sections</strong> (1.23.0): click a section heading to collapse or expand it. Your choice is remembered in this browser.</li>
          <li>
            <strong>Select several nodes at once</strong>: hold Shift and
            drag a box around them (an ordinary drag still pans), or click a
            node type in the legend. With more than one selected, the
            details panel shows <strong>bulk actions</strong> instead -
            Pin all, Unpin all, Hide all, Expand all - each the same action
            a single node already has.
          </li>
          <li>
            <strong>Right-click a node</strong> (1.20.0): opens a context
            menu with the same actions the details panel already offers -
            Expand/Collapse, Pin/Unpin, Hide, Centre on screen, View
            supporting events, Use as path endpoint. Right-clicking also
            selects the node.
          </li>
          <li>
            <strong>Right-click a relationship</strong> (1.21.0): opens a
            smaller context menu with View supporting events - the one
            action beyond editing the details panel offers for a
            relationship. Right-clicking empty canvas shows no menu
            either way.
          </li>
        </ul>
      </section>

      <section className="graphlens-section">
        <h2>Filters and legend</h2>
        <p>
          The left-hand panel lets you hide specific node/relationship types
          (data stays loaded, only the display is filtered), set a minimum/
          maximum risk score and minimum event count, slice by a time window
          (two sliders over whatever is currently loaded, by its own first-
          seen/last-seen span - separate from the toolbar&apos;s own time
          range below, and never re-runs a search), and shows a colour
          legend for every type currently present in your graph - guaranteed
          distinct for whatever types are on screen at once, and clickable
          to select every visible node of that type. An
          <strong> Indicators</strong> section below it explains the
          canvas&apos;s status cues (1.24.0), which never hide each other
          or change a node&apos;s own colour: a red glow behind a node
          with risk score 70+, a double border for pinned, a dark ring
          outside the node for selected, and a green dashed border for a
          node on a highlighted path. Each node type also has its own
          shape, shown in the legend. The toolbar&apos;s
          time range dropdown changes the window used by subsequent searches
          (it does not retroactively re-run past expansions).
        </p>
      </section>

      <section className="graphlens-section">
        <h2>Colours (this session only)</h2>
        <p>
          The left-hand panel also lets you override a node or relationship
          type&apos;s colour for this browser tab only - never written
          anywhere, never seen by anyone else, gone on reload. It does not
          change the curated colours an administrator has set up.
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
        <h2>Saved views</h2>
        <p>
          The left-hand panel&apos;s <strong>Saved views</strong> section
          names and saves the graph you are looking at - which node you
          started from and which of its neighbours you expanded - so you
          can come back to it later. <strong>Load</strong> re-runs the same
          searches a live exploration would (so you see current data, not a
          frozen copy - use Export for that), and only works for a graph
          that started from a single search result. Saved views are private
          to you.
        </p>
      </section>

      <section className="graphlens-section">
        <h2>Export and import</h2>
        <p>
          Toolbar <strong>Export</strong> button: JSON (full graph data plus
          metadata), CSV (nodes or edges), or PNG (canvas snapshot). Exports
          only ever include what is currently visible to you. Toolbar
          <strong> Import</strong> button accepts either of two file
          shapes, replacing the current graph - detected automatically by
          file extension (falling back to content, if neither matches).
          If the canvas already has anything on it, Import (and
          <strong> Load from job</strong> below) asks you to confirm
          first (1.21.0); an empty canvas skips straight to it:
        </p>
        <ul>
          <li>
            A previously exported <strong>JSON</strong> file - a
            convenience for resuming or sharing a specific snapshot (the
            exported CSV files are not re-importable the same way: they
            are two separate flat tables with different column names,
            not this schema).
          </li>
          <li>
            A <strong>CSV</strong> file already shaped to the
            relationship schema below (the same schema an index, lookup,
            saved search, Table Dataset or <strong>Load from job</strong>
            {' '}already produces, and the one the bundled sample data
            ships as) - a one-off way to bring your own data onto the
            canvas without any Splunk-side configuration at all. Rows
            matching neither a node row nor an edge row are silently
            skipped. If your role has the <code>graphlens_edit_graph_data</code>
            {' '}capability (1.19.0), a CSV opens in a review table first
            so you can fix a cell before clicking Load, instead of
            loading straight onto the canvas.
          </li>
        </ul>
        <p>
          Either way, the file is read entirely in your browser (nothing
          is uploaded), and every imported node and edge is re-validated
          the same way a live search result would be, so an import can
          never add anything GraphLens would not otherwise accept. See
          &quot;Loading your own data&quot; below for the persistent
          ways to bring data in (index, lookup, saved search, Table
          Dataset).
        </p>
      </section>

      <section className="graphlens-section">
        <h2>Editing a node or relationship</h2>
        <p>
          If your role has the <code>graphlens_edit_graph_data</code>
          {' '}capability (1.19.0), the Details panel for a selected node
          or relationship shows an <strong>Edit</strong> button. Edit
          mode lets you change its label, type, risk score, event count
          and a few other fields - every edited value is re-validated
          exactly the same way a fresh search result would be (control
          characters stripped, risk scores clamped to 0-100). Text such
          as &quot;AT&amp;T&quot; is kept exactly as you type it (1.22.0) -
          it is only ever displayed as text, never interpreted as HTML. An edit is
          session-only: it changes only what you see in this browser,
          is never sent to Splunk or seen by anyone else, and is lost on
          Reset graph or a reload - re-export (CSV/JSON) afterward if you
          want to keep a correction. See SECURITY.md, &quot;Editing graph
          data,&quot; for why this is the one capability in GraphLens
          with no corresponding server-side enforcement: nothing is
          written back to Splunk, so there is nothing for a REST
          endpoint to reject. Saving shows an <strong>Edited
          &quot;&lt;name&gt;&quot;</strong> banner with an
          <strong> Undo</strong> button (1.21.0) that reverts that one
          save - only the single most recent edit can be undone this
          way; making another edit, or dismissing the banner, clears it,
          as does anything that replaces the graph. Picking a search
          result, loading a query result onto the canvas or loading a
          saved view after you have made an edit asks you to confirm
          first (1.22.0), since edits are never saved anywhere.
        </p>
      </section>

      <section className="graphlens-section">
        <h2>Where the relationship data comes from</h2>
        <p>
          An administrator chooses, on the Configuration page, whether
          searches and expansions read observed relationships from a Splunk
          <strong> index</strong> (the normal, time-series choice, updated by
          an ingestion pipeline or scheduled search), directly from a
          <strong> lookup table</strong> (a static, hand- or script-maintained
          table - no ingestion pipeline required), from an administrator&apos;s
          own <strong> saved search</strong> (an already-authored query
          whose results already match the relationship shape), or from a
          <strong> Table Dataset</strong> (Settings &gt; Datasets - the same
          idea as a saved search, authored through Splunk&apos;s own
          point-and-click Datasets editor instead). The latter two each
          require a separate capability, since GraphLens does not review
          what that search or dataset actually does. This only changes
          where the data comes from, not how you use GraphLens -
          searching, expanding, filtering, and exporting all work the
          same regardless of which. One difference to know about: in
          lookup, saved-search or Table Dataset mode, the toolbar&apos;s
          time range has no effect, since none of the three is a
          time-series the way an index is.
        </p>
      </section>

      <section className="graphlens-section">
        <h2>Loading your own data</h2>
        <p>
          GraphLens is a visualization layer over data already in Splunk -
          it has no file-upload feature of its own. Relationships are
          brought in shaped to the schema below, either as indexed events
          (via a scheduled search transforming existing events, a one-off
          file upload, or a live HTTP Event Collector source), as a lookup
          table in lookup mode, as the results of an already-authored
          search in saved-search mode, or as a Table Dataset built through
          Settings &gt; Datasets (see &quot;Where the relationship data
          comes from&quot; above) - the same shape is required regardless
          of which of the four you use; GraphLens applies no
          transformation of its own. Afterwards you register your
          node/relationship types in the <code>graphlens_node_types</code>
          {' '}/ <code>graphlens_relationship_types</code> KV Store
          collections - an unregistered type still renders, with a default
          colour - and optionally wire up <code>evidence_reference</code>
          {' '}so <strong>View supporting events</strong> works for an
          edge. See DATA_INGESTION.md and DATA_MODEL.md in the installed
          package for the complete, step-by-step guide and the full data
          model (including the separate node/edge JSON shapes used
          elsewhere, e.g. curated KV Store metadata).
        </p>
        <table className="graphlens-data-table" style={{ marginBottom: 12 }}>
          <thead>
            <tr>
              <th>Field</th>
              <th>Required</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['edge_id', 'no', 'Derived deterministically from source_id + relationship_type + target_id if omitted.'],
              ['source_id', 'yes', 'Namespaced, stable identifier, e.g. user:jsmith. Must match ^[A-Za-z0-9][A-Za-z0-9:_\\-.@/]{0,254}$ - no quotes, backslashes, pipes, wildcards, spaces or control characters.'],
              ['source_type', 'yes', 'Short type token, e.g. user, host, ip. Governed by graphlens_node_types.'],
              ['source_label', 'yes', 'Display label for the source node. Treated as untrusted; stored as plain text and only ever displayed as text, never as HTML.'],
              ['target_id', 'yes', 'Same identifier grammar as source_id.'],
              ['target_type', 'yes', 'Same as source_type, for the target node.'],
              ['target_label', 'yes', 'Same as source_label, for the target node.'],
              ['relationship_type', 'yes', 'Short type token, e.g. AUTHENTICATED_TO. Governed by graphlens_relationship_types.'],
              ['relationship_label', 'no', 'Display label; defaults to relationship_type.'],
              ['event_count', 'no', 'Number. Summed across duplicate rows when merged.'],
              ['first_seen / last_seen', 'no', 'ISO-8601 timestamps, e.g. 2026-07-15T08:00:00Z. Widened (min/max) across duplicate rows when merged. Ignored entirely in lookup/saved-search mode (neither is a time series).'],
              ['risk_score', 'no', 'Number, clamped to 0-100.'],
              ['source_index / source_sourcetype', 'no', 'Where the backing raw event actually lives - drives View supporting events. Should name real, existing index/sourcetype values.'],
              ['evidence_reference', 'no', 'Opaque key joined against a raw evidence event’s own evidence_reference field for View supporting events. Must be a valid identifier if set.'],
            ].map(([field, required, notes]) => (
              <tr key={field}>
                <td style={{ whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{field}</td>
                <td>{required}</td>
                <td>{notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 12, color: '#5c6773' }}>
          This is the flat row/event shape every relationship source
          (index, lookup, saved search, Table Dataset) must already
          produce - the same
          one <code>sample_data/graphlens_relationships_sample.csv</code>
          {' '}and <code>lookups/graphlens_sample_relationships.csv</code>
          {' '}use, and the one the Configuration page&apos;s Load demo
          data button loads. It is distinct from the nested node/edge JSON
          objects DATA_MODEL.md also documents, which describe curated KV
          Store metadata (<code>graphlens_nodes</code> /
          <code> graphlens_edges</code>) rather than observed relationship
          rows.
        </p>
        <p style={{ fontSize: 12, color: '#5c6773' }}>
          The toolbar&apos;s <strong>Load from job</strong> button is a
          fifth, one-time way to get rows matching this same schema onto
          the canvas: paste the job ID (sid) of a search you already ran
          anywhere in Splunk - Splunk Web&apos;s own Search app, for
          example - and GraphLens loads that job&apos;s results directly,
          without changing the Configuration page&apos;s relationship
          data source. Unlike the four sources above, this is not a
          persistent setting: a job&apos;s results are themselves
          ephemeral, expired by Splunk once the job finishes unless
          pinned or scheduled, so it only works for a limited time after
          the search completes.
        </p>
        <p style={{ fontSize: 12, color: '#5c6773' }}>
          The toolbar&apos;s <strong>Import</strong> button is a sixth,
          one-time way to get rows matching this same schema onto the
          canvas, from a CSV file instead of a live Splunk job - see
          &quot;Export and import&quot; above.
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
          language, time slicer, style overrides), and
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
        <p>
          The same page&apos;s <strong>Load demo data</strong> button
          (requires <code>graphlens_manage_collections</code>) seeds a
          small bundled sample dataset - node/relationship type
          configuration plus a handful of sample relationships loaded into
          whichever relationship data source is currently configured - so
          a fresh install can be explored immediately. It replaces the
          current type configuration and, in lookup mode, the entire
          configured relationship lookup; see CONFIGURATION.md&apos;s
          &quot;Demo data&quot; section before using it on an instance with
          real curated data.
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
        <p>
          Toolbar <strong>Reset graph</strong> clears everything and
          returns you to the empty state - asking you to confirm first
          (1.21.0) if the canvas already has anything on it.
        </p>
      </section>

      <p style={{ fontSize: 12, color: '#5c6773' }}>
        GraphLens {APP_VERSION}. The sections above condense
        DATA_INGESTION.md, CONFIGURATION.md and SECURITY.md; for those in
        full, plus the data model and admin guide, see this app&apos;s
        documentation files in its installed package.
      </p>
    </div>
  );
}
