import React from 'react';
import PropTypes from 'prop-types';
import Button from '@splunk/react-ui/Button';
import Select from '@splunk/react-ui/Select';
import Tooltip from '@splunk/react-ui/Tooltip';
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
  const viewDisabled = viewMode !== 'graph';
  const hasDataActions = importEnabled || exportEnabled || loadFromJobEnabled;
  // 1.23.0: grouped (find | view | data), separated by thin dividers, with
  // the destructive Reset graph pushed to the far right. Each group wraps
  // as a unit on a narrow screen rather than splitting mid-group. The
  // three canvas view actions are icon-only (with a tooltip and an
  // accessible name) so the whole toolbar fits on one row at common
  // laptop widths.
  return (
    <div className="graphlens-toolbar" role="toolbar" aria-label="Graph controls">
      <div className="graphlens-toolbar-group">
        <EntitySearch isLoading={isSearching} results={searchResults} onSearch={onSearch} onPickResult={onPickResult} />
        <TimeRangeSelector earliest={earliest} latest={latest} onChange={onTimeRangeChange} />
      </div>
      <span className="graphlens-toolbar-divider" aria-hidden="true" />
      <div className="graphlens-toolbar-group">
        {/*
          1.24.0: the selected view is a neutral "pressed" state (styled
          from aria-selected in App.css), no longer the green primary fill
          every call-to-action button (Search, Expand, Save) uses.
        */}
        <div role="tablist" aria-label="Graph view" className="graphlens-toolbar-tabs">
          <Button
            label="Graph"
            icon={<ChartLinkGraph />}
            appearance="secondary"
            className="graphlens-view-tab"
            role="tab"
            aria-selected={viewMode === 'graph'}
            onClick={() => onViewModeChange('graph')}
          />
          <Button
            label="Table"
            icon={<Table />}
            appearance="secondary"
            className="graphlens-view-tab"
            role="tab"
            aria-selected={viewMode === 'table'}
            onClick={() => onViewModeChange('table')}
          />
        </div>
        <Select
          inputId="graphlens-layout-select"
          prefixLabel="Layout"
          aria-label="Layout"
          value={layoutName}
          onChange={(e, { value }) => onLayoutChange(value)}
          disabled={viewDisabled}
        >
          {CYTOSCAPE_LAYOUTS.map((l) => <Select.Option key={l} label={l} value={l} icon={<Layout />} />)}
        </Select>
        <Tooltip content="Recalculate layout">
          <Button icon={<ArrowClockwise />} aria-label="Recalculate layout" onClick={onRecalculateLayout} disabled={viewDisabled} />
        </Tooltip>
        <Tooltip content="Fit to screen">
          <Button icon={<ArrowsFourCorners />} aria-label="Fit to screen" onClick={onFit} disabled={viewDisabled} />
        </Tooltip>
        <Tooltip content="Centre selected">
          <Button icon={<NodesCentered />} aria-label="Centre selected" onClick={onCenterSelected} disabled={viewDisabled} />
        </Tooltip>
      </div>
      {hasDataActions && (
        <>
          <span className="graphlens-toolbar-divider" aria-hidden="true" />
          <div className="graphlens-toolbar-group">
            {importEnabled && <Button label="Import" icon={<ArrowCircleInRight />} onClick={onImportClick} />}
            {exportEnabled && <Button label="Export" icon={<ArrowCircleOutRight />} onClick={onExportOpen} />}
            {loadFromJobEnabled && <Button label="Load from job" icon={<MagnifierClock />} onClick={onLoadFromJobOpen} />}
          </div>
        </>
      )}
      <span className="graphlens-toolbar-spacer" />
      <Button label="Reset graph" icon={<TrashCanCross />} onClick={onReset} appearance="destructiveSecondary" className="graphlens-reset-button" />
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
