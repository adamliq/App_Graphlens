import React from 'react';
import PropTypes from 'prop-types';
import Select from '@splunk/react-ui/Select';

export const TIME_RANGE_PRESETS = [
  { label: 'Last 15 minutes', earliest: '-15m', latest: 'now' },
  { label: 'Last hour', earliest: '-1h', latest: 'now' },
  { label: 'Last 24 hours', earliest: '-24h', latest: 'now' },
  { label: 'Last 7 days', earliest: '-7d', latest: 'now' },
  { label: 'Last 30 days', earliest: '-30d', latest: 'now' },
  { label: 'All time', earliest: '0', latest: 'now' },
];

export default function TimeRangeSelector({ earliest, latest, onChange }) {
  const current = TIME_RANGE_PRESETS.find((p) => p.earliest === earliest && p.latest === latest) || TIME_RANGE_PRESETS[2];

  return (
    <Select
      inputId="graphlens-time-range"
      aria-label="Time range"
      value={current.earliest}
      onChange={(e, { value }) => {
        const preset = TIME_RANGE_PRESETS.find((p) => p.earliest === value);
        if (preset) onChange(preset);
      }}
    >
      {TIME_RANGE_PRESETS.map((preset) => (
        <Select.Option key={preset.earliest} label={preset.label} value={preset.earliest} />
      ))}
    </Select>
  );
}

TimeRangeSelector.propTypes = {
  earliest: PropTypes.string.isRequired,
  latest: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};
