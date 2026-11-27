import React from 'react';
import PropTypes from 'prop-types';
import Button from '@splunk/react-ui/Button';

/**
 * A client-side time-window filter over whatever is already loaded (the
 * same kind of filter RiskFilter already applies, just against each
 * element's first_seen/last_seen span instead of risk/event count). It
 * never changes what gets fetched - the toolbar's time range still
 * controls that - it only hides elements whose span falls entirely
 * outside the selected window, the same way the Risk filter hides by
 * score without re-running any search.
 */
export default function TimeSlicer({ minMs, maxMs, valueMin, valueMax, onChange }) {
  if (minMs === null || maxMs === null || minMs >= maxMs) {
    return (
      <div className="graphlens-section">
        <p style={{ fontSize: 12, color: '#8a8a8a' }} aria-labelledby="graphlens-time-slicer-heading">
          Not enough time-stamped data in the current graph to slice by time.
        </p>
      </div>
    );
  }

  const effMin = Number.isFinite(valueMin) ? valueMin : minMs;
  const effMax = Number.isFinite(valueMax) ? valueMax : maxMs;

  return (
    <div className="graphlens-section">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} aria-labelledby="graphlens-time-slicer-heading">
        <label htmlFor="graphlens-time-from" style={{ fontSize: 12 }}>
          From: {new Date(effMin).toLocaleString()}
          <input
            id="graphlens-time-from"
            type="range"
            min={minMs}
            max={maxMs}
            value={effMin}
            style={{ width: '100%' }}
            onChange={(e) => onChange({ timeFilterMin: Math.min(Number(e.target.value), effMax), timeFilterMax: effMax })}
          />
        </label>
        <label htmlFor="graphlens-time-to" style={{ fontSize: 12 }}>
          To: {new Date(effMax).toLocaleString()}
          <input
            id="graphlens-time-to"
            type="range"
            min={minMs}
            max={maxMs}
            value={effMax}
            style={{ width: '100%' }}
            onChange={(e) => onChange({ timeFilterMin: effMin, timeFilterMax: Math.max(Number(e.target.value), effMin) })}
          />
        </label>
        {(Number.isFinite(valueMin) || Number.isFinite(valueMax)) && (
          <div className="graphlens-actions-row">
            <Button label="Reset window" onClick={() => onChange({ timeFilterMin: undefined, timeFilterMax: undefined })} />
          </div>
        )}
      </div>
    </div>
  );
}

TimeSlicer.propTypes = {
  minMs: PropTypes.number,
  maxMs: PropTypes.number,
  valueMin: PropTypes.number,
  valueMax: PropTypes.number,
  onChange: PropTypes.func.isRequired,
};

TimeSlicer.defaultProps = { minMs: null, maxMs: null, valueMin: undefined, valueMax: undefined };
