import React from 'react';
import PropTypes from 'prop-types';
import Button from '@splunk/react-ui/Button';
import Select from '@splunk/react-ui/Select';
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
}) {
  return (
    <div className="graphlens-toolbar" role="toolbar" aria-label="Graph controls">
      <EntitySearch isLoading={isSearching} results={searchResults} onSearch={onSearch} onPickResult={onPickResult} />
      <TimeRangeSelector earliest={earliest} latest={latest} onChange={onTimeRangeChange} />
      <div role="tablist" aria-label="Graph view" style={{ display: 'flex', gap: 4 }}>
        <Button
          label="Diagram"
          appearance={viewMode === 'diagram' ? 'primary' : 'secondary'}
          role="tab"
          aria-selected={viewMode === 'diagram'}
          onClick={() => onViewModeChange('diagram')}
        />
        <Button
          label="Text"
          appearance={viewMode === 'text' ? 'primary' : 'secondary'}
          role="tab"
          aria-selected={viewMode === 'text'}
          onClick={() => onViewModeChange('text')}
        />
      </div>
      <label htmlFor="graphlens-layout-select" style={{ fontSize: 12 }}>
        Layout{' '}
        <Select inputId="graphlens-layout-select" value={layoutName} onChange={(e, { value }) => onLayoutChange(value)} disabled={viewMode !== 'diagram'}>
          {CYTOSCAPE_LAYOUTS.map((l) => <Select.Option key={l} label={l} value={l} />)}
        </Select>
      </label>
      <Button label="Recalculate layout" onClick={onRecalculateLayout} disabled={viewMode !== 'diagram'} />
      <Button label="Fit to screen" onClick={onFit} disabled={viewMode !== 'diagram'} />
      <Button label="Centre selected" onClick={onCenterSelected} disabled={viewMode !== 'diagram'} />
      <Button label="Reset graph" onClick={onReset} appearance="destructive" />
      {importEnabled && <Button label="Import" onClick={onImportClick} />}
      {exportEnabled && <Button label="Export" onClick={onExportOpen} />}
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
  viewMode: PropTypes.oneOf(['diagram', 'text']).isRequired,
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
};
