import React from 'react';
import PropTypes from 'prop-types';
import Select from '@splunk/react-ui/Select';
import Clock from '@splunk/react-icons/Clock';
import Tooltip from '@splunk/react-ui/Tooltip';

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

  // 1.25.0: this range applies to new searches and expansions only - it
  // never re-filters what is already on the graph (that is the sidebar's
  // "Filter by activity time"). Said in the tooltip and the accessible name.
  return (
    <Tooltip content="Search range: applies to new searches and expansions, not to what is already on the graph." contentRelationship="description">
    <Select
      inputId="graphlens-time-range"
      aria-label="Search range for new searches and expansions"
      value={current.earliest}
      onChange={(e, { value }) => {
        const preset = TIME_RANGE_PRESETS.find((p) => p.earliest === value);
        if (preset) onChange(preset);
      }}
    >
      {TIME_RANGE_PRESETS.map((preset) => (
        <Select.Option key={preset.earliest} label={preset.label} value={preset.earliest} icon={<Clock />} />
      ))}
    </Select>
    </Tooltip>
  );
}

TimeRangeSelector.propTypes = {
  earliest: PropTypes.string.isRequired,
  latest: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};
