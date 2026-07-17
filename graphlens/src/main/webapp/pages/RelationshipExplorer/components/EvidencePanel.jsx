import React from 'react';
import PropTypes from 'prop-types';
import WaitSpinner from '@splunk/react-ui/WaitSpinner';
import Button from '@splunk/react-ui/Button';

export default function EvidencePanel({ isLoading, error, rows, fieldOrder, targetLabel, onOpenInSearch, onClear }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: '4px 0' }}>
          Supporting events {targetLabel ? `for ${targetLabel}` : ''}
        </h3>
        <div className="graphlens-actions-row" style={{ marginTop: 0 }}>
          {onOpenInSearch && <Button label="Open in Splunk Search" onClick={onOpenInSearch} />}
          {targetLabel && <Button label="Clear" appearance="subtle" onClick={onClear} />}
        </div>
      </div>
      {isLoading && <WaitSpinner size="small" />}
      {error && <div className="graphlens-error-banner" role="alert">{error.message}</div>}
      {!isLoading && !error && targetLabel && rows.length === 0 && (
        <p style={{ fontSize: 12, color: '#8a8a8a' }}>No supporting events were found for this selection in the current time range.</p>
      )}
      {!isLoading && rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {fieldOrder.map((f) => (
                  <th key={f} style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '4px 8px' }}>{f}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                // eslint-disable-next-line react/no-array-index-key
                <tr key={idx}>
                  {fieldOrder.map((f) => (
                    <td key={f} style={{ padding: '4px 8px', borderBottom: '1px solid #eee' }}>{String(row[f] ?? '')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

EvidencePanel.propTypes = {
  isLoading: PropTypes.bool.isRequired,
  error: PropTypes.object,
  rows: PropTypes.array.isRequired,
  fieldOrder: PropTypes.array.isRequired,
  targetLabel: PropTypes.string,
  onOpenInSearch: PropTypes.func,
  onClear: PropTypes.func.isRequired,
};

EvidencePanel.defaultProps = { error: null, targetLabel: null, onOpenInSearch: undefined };
