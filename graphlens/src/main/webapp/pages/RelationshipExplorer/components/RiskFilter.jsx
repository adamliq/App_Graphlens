import React from 'react';
import PropTypes from 'prop-types';
import Number from '@splunk/react-ui/Number';

export default function RiskFilter({ riskMin, riskMax, minEventCount, onChange }) {
  return (
    <div className="graphlens-section">
      <h3 id="graphlens-risk-filter-heading">Risk &amp; frequency</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} aria-labelledby="graphlens-risk-filter-heading">
        <label htmlFor="graphlens-risk-min" style={{ fontSize: 12 }}>
          Minimum risk score
          <Number
            inputId="graphlens-risk-min"
            value={riskMin}
            min={0}
            max={100}
            onChange={(e, { value }) => onChange({ riskMin: value, riskMax, minEventCount })}
          />
        </label>
        <label htmlFor="graphlens-risk-max" style={{ fontSize: 12 }}>
          Maximum risk score
          <Number
            inputId="graphlens-risk-max"
            value={riskMax}
            min={0}
            max={100}
            onChange={(e, { value }) => onChange({ riskMin, riskMax: value, minEventCount })}
          />
        </label>
        <label htmlFor="graphlens-min-event-count" style={{ fontSize: 12 }}>
          Minimum event count
          <Number
            inputId="graphlens-min-event-count"
            value={minEventCount}
            min={0}
            onChange={(e, { value }) => onChange({ riskMin, riskMax, minEventCount: value })}
          />
        </label>
      </div>
    </div>
  );
}

RiskFilter.propTypes = {
  riskMin: PropTypes.number.isRequired,
  riskMax: PropTypes.number.isRequired,
  minEventCount: PropTypes.number.isRequired,
  onChange: PropTypes.func.isRequired,
};
