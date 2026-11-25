import React from 'react';
import PropTypes from 'prop-types';
import Button from '@splunk/react-ui/Button';
import Select from '@splunk/react-ui/Select';
import ChartLinkGraph from '@splunk/react-icons/ChartLinkGraph';
import Table from '@splunk/react-icons/Table';
import Layout from '@splunk/react-icons/Layout';
import ArrowClockwise from '@splunk/react-icons/ArrowClockwise';
import ArrowsFourCorners from '@splunk/react-icons/ArrowsFourCorners';
import NodesCentered from '@splunk/react-icons/NodesCentered';
import TrashCanCross from '@splunk/react-icons/TrashCanCross';
import ArrowCircleInRight from '@splunk/react-icons/ArrowCircleInRight';
import ArrowCircleOutRight from '@splunk/react-icons/ArrowCircleOutRight';
import MagnifierClock from '@splunk/react-icons/MagnifierClock';
import EntitySearch from './EntitySearch';
import TimeRangeSelector from './TimeRangeSelector';
import { CYTOSCAPE_LAYOUTS } from './GraphCanvas';

export default function GraphToolbar({
  isSearching,
  searchResults,
  onSearch,
  onPickResult,
  earliest,
  latest,
  onTimeRangeChange,
  viewMode,
  onViewModeChange,
  layoutName,
  onLayoutChange,
  onRecalculateLayout,
  onFit,
  onCenterSelected,
  onReset,
  onExportOpen,
  exportEnabled,
  onImportClick,
  importEnabled,
  onLoadFromJobOpen,
  loadFromJobEnabled,
}) {
  return (
    <div className="graphlens-toolbar" role="toolbar" aria-label="Graph controls">
      <EntitySearch isLoading={isSearching} results={searchResults} onSearch={onSearch} onPickResult={onPickResult} />
      <TimeRangeSelector earliest={earliest} latest={latest} onChange={onTimeRangeChange} />
      <div role="tablist" aria-label="Graph view" style={{ display: 'flex', gap: 4 }}>
        <Button
          label="Graph"
          icon={<ChartLinkGraph />}
          appearance={viewMode === 'graph' ? 'primary' : 'secondary'}
          role="tab"
          aria-selected={viewMode === 'graph'}
          onClick={() => onViewModeChange('graph')}
        />
        <Button
          label="Table"
          icon={<Table />}
          appearance={viewMode === 'table' ? 'primary' : 'secondary'}
          role="tab"
          aria-selected={viewMode === 'table'}
          onClick={() => onViewModeChange('table')}
        />
      </div>
      <label htmlFor="graphlens-layout-select" style={{ fontSize: 12 }}>
        Layout{' '}
        <Select inputId="graphlens-layout-select" value={layoutName} onChange={(e, { value }) => onLayoutChange(value)} disabled={viewMode !== 'graph'}>
          {CYTOSCAPE_LAYOUTS.map((l) => <Select.Option key={l} label={l} value={l} icon={<Layout />} />)}
        </Select>
      </label>
      <Button label="Recalculate layout" icon={<ArrowClockwise />} onClick={onRecalculateLayout} disabled={viewMode !== 'graph'} />
      <Button label="Fit to screen" icon={<ArrowsFourCorners />} onClick={onFit} disabled={viewMode !== 'graph'} />
      <Button label="Centre selected" icon={<NodesCentered />} onClick={onCenterSelected} disabled={viewMode !== 'graph'} />
      <Button label="Reset graph" icon={<TrashCanCross />} onClick={onReset} appearance="destructive" />
      {importEnabled && <Button label="Import" icon={<ArrowCircleInRight />} onClick={onImportClick} />}
      {exportEnabled && <Button label="Export" icon={<ArrowCircleOutRight />} onClick={onExportOpen} />}
      {loadFromJobEnabled && <Button label="Load from job" icon={<MagnifierClock />} onClick={onLoadFromJobOpen} />}
    </div>
  );
}

GraphToolbar.propTypes = {
  isSearching: PropTypes.bool.isRequired,
  searchResults: PropTypes.array.isRequired,
  onSearch: PropTypes.func.isRequired,
  onPickResult: PropTypes.func.isRequired,
  earliest: PropTypes.string.isRequired,
  latest: PropTypes.string.isRequired,
  onTimeRangeChange: PropTypes.func.isRequired,
  viewMode: PropTypes.oneOf(['graph', 'table']).isRequired,
  onViewModeChange: PropTypes.func.isRequired,
  layoutName: PropTypes.string.isRequired,
  onLayoutChange: PropTypes.func.isRequired,
  onRecalculateLayout: PropTypes.func.isRequired,
  onFit: PropTypes.func.isRequired,
  onCenterSelected: PropTypes.func.isRequired,
  onReset: PropTypes.func.isRequired,
  onExportOpen: PropTypes.func.isRequired,
  exportEnabled: PropTypes.bool.isRequired,
  onImportClick: PropTypes.func.isRequired,
  importEnabled: PropTypes.bool.isRequired,
  onLoadFromJobOpen: PropTypes.func.isRequired,
  loadFromJobEnabled: PropTypes.bool.isRequired,
};
