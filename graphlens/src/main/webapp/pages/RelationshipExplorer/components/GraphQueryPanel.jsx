import React, { useState } from 'react';
import PropTypes from 'prop-types';
import Button from '@splunk/react-ui/Button';
import TextArea from '@splunk/react-ui/TextArea';
import QueryResultPreview from './QueryResultPreview';

const EXAMPLE_QUERY = '{\n  node(search: "alice") {\n    id\n    label\n    riskScore\n    FRIEND_OF(direction: OUTGOING, limit: 10) {\n      id\n      label\n    }\n  }\n}';

/**
 * A text query box for GraphLens's restricted, GraphQL-like query language
 * (see graphQueryLanguage.js / graphQueryExecutor.js). This is not a
 * general-purpose graph-database query console: every query compiles down
 * to the same small set of bounded, pre-reviewed searches the rest of the
 * app already uses (see SECURITY.md) - it just lets you describe, in one
 * request, which node to start from and which of its relationships to
 * follow, instead of clicking Expand repeatedly.
 */
export default function GraphQueryPanel({
  isRunning, error, result, nodeColorByType, relationshipColorByType, onRunQuery, onLoadOntoCanvas,
}) {
  const [queryText, setQueryText] = useState(EXAMPLE_QUERY);
  const [localError, setLocalError] = useState(null);
  const [viewMode, setViewMode] = useState('diagram');

  const handleRun = () => {
    if (!queryText.trim()) {
      setLocalError('Enter a query first.');
      return;
    }
    setLocalError(null);
    onRunQuery(queryText);
  };

  const displayError = localError || (error && error.message);

  // Coloured the same way the main canvas/legend are, so the preview never
  // looks like a different, unrelated graph (see the 1.6.0 colour-
  // consistency invariant in ARCHITECTURE.md) - purely cosmetic, never
  // written back into the result itself.
  const previewNodes = result
    ? result.nodes.map((n) => ({ data: { ...n.data, color: nodeColorByType[n.data.type] || n.data.color } }))
    : [];
  const previewEdges = result
    ? result.edges.map((e) => ({ data: { ...e.data, color: relationshipColorByType[e.data.relationship] || e.data.color } }))
    : [];

  return (
    <div className="graphlens-section">
      <h3 id="graphlens-query-heading">Query</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} aria-labelledby="graphlens-query-heading">
        <TextArea
          inputId="graphlens-query-text"
          value={queryText}
          onChange={(e, { value }) => setQueryText(value)}
          rowsMin={6}
          rowsMax={16}
          placeholder={EXAMPLE_QUERY}
        />
        <div className="graphlens-actions-row">
          <Button label={isRunning ? 'Running...' : 'Run query'} appearance="primary" onClick={handleRun} disabled={isRunning} />
          {result && <Button label="Load onto canvas" onClick={onLoadOntoCanvas} />}
        </div>
        {displayError && <p role="alert" style={{ fontSize: 12, color: '#7a1f1f' }}>{displayError}</p>}
        {result && (
          <>
            <p style={{ fontSize: 12 }}>
              {result.nodes.length} node(s), {result.edges.length} relationship(s) resolved
              {result.diagnostics.truncated ? ' - result was truncated by a configured limit.' : '.'}
            </p>
            <div className="graphlens-actions-row" role="tablist" aria-label="Result view">
              <Button
                label="Diagram"
                appearance={viewMode === 'diagram' ? 'primary' : 'secondary'}
                role="tab"
                aria-selected={viewMode === 'diagram'}
                onClick={() => setViewMode('diagram')}
              />
              <Button
                label="Text"
                appearance={viewMode === 'text' ? 'primary' : 'secondary'}
                role="tab"
                aria-selected={viewMode === 'text'}
                onClick={() => setViewMode('text')}
              />
            </div>
            {viewMode === 'diagram' ? (
              <QueryResultPreview nodes={previewNodes} edges={previewEdges} />
            ) : (
              <pre style={{ fontSize: 11, maxHeight: 220, overflow: 'auto', background: '#f5f5f5', padding: 8, margin: 0 }}>
                {JSON.stringify(result.tree, null, 2)}
              </pre>
            )}
          </>
        )}
      </div>
    </div>
  );
}

GraphQueryPanel.propTypes = {
  isRunning: PropTypes.bool,
  error: PropTypes.shape({ message: PropTypes.string }),
  result: PropTypes.shape({
    tree: PropTypes.array,
    nodes: PropTypes.array,
    edges: PropTypes.array,
    diagnostics: PropTypes.shape({ truncated: PropTypes.bool, totalExpansions: PropTypes.number }),
  }),
  nodeColorByType: PropTypes.object,
  relationshipColorByType: PropTypes.object,
  onRunQuery: PropTypes.func.isRequired,
  onLoadOntoCanvas: PropTypes.func.isRequired,
};

GraphQueryPanel.defaultProps = {
  isRunning: false, error: null, result: null, nodeColorByType: {}, relationshipColorByType: {},
};
