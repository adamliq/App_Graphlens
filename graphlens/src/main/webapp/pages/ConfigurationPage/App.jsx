import React, { useEffect, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import Button from '@splunk/react-ui/Button';
import Number from '@splunk/react-ui/Number';
import Select from '@splunk/react-ui/Select';
import Switch from '@splunk/react-ui/Switch';
import Text from '@splunk/react-ui/Text';
import WaitSpinner from '@splunk/react-ui/WaitSpinner';

import { getSettings, updateSettingsStanza, relationshipSourceFromSettings } from '../../shared/services/configService';
import { hasCapability, CAPABILITIES } from '../../shared/services/capabilityService';
import { recordAuditEvent, AUDIT_ACTIONS } from '../../shared/services/auditService';
import { loadDemoData } from '../../shared/services/demoDataService';
import { toUserFacingError } from '../../shared/utilities/restClient';
import PageNav from '../../shared/components/PageNav';

export default function App() {
  const [settings, setSettings] = useState(null);
  const [canManage, setCanManage] = useState(false);
  const [canManageCollections, setCanManageCollections] = useState(false);
  const [canUseSearchSource, setCanUseSearchSource] = useState(false);
  const [status, setStatus] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const reload = useCallback(async () => {
    const [loadedSettings, allowed, allowedCollections, allowedSearchSource] = await Promise.all([
      getSettings(),
      hasCapability(CAPABILITIES.MANAGE_CONFIG),
      hasCapability(CAPABILITIES.MANAGE_COLLECTIONS),
      hasCapability(CAPABILITIES.USE_SEARCH_SOURCE),
    ]);
    setSettings(loadedSettings);
    setCanManage(allowed);
    setCanManageCollections(allowedCollections);
    setCanUseSearchSource(allowedSearchSource);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const save = useCallback(async (stanza, values) => {
    setIsSaving(true);
    setStatus(null);
    try {
      await updateSettingsStanza(stanza, values);
      await recordAuditEvent(AUDIT_ACTIONS.CONFIG_CHANGE, { detail: stanza });
      await reload();
      setStatus({ type: 'success', message: `Saved ${stanza} settings.` });
    } catch (err) {
      const normalized = toUserFacingError(err);
      setStatus({ type: 'error', message: normalized.message });
    } finally {
      setIsSaving(false);
    }
  }, [reload]);

  const handleLoadDemoData = useCallback(async () => {
    setIsSaving(true);
    setStatus(null);
    try {
      const result = await loadDemoData({ source: relationshipSourceFromSettings(settings) });
      await recordAuditEvent(AUDIT_ACTIONS.LOAD_DEMO_DATA, {
        detail: `Loaded demo node/relationship types and ${result.relationshipCount} relationships (${result.mode} mode)`,
      });
      setStatus({
        type: 'success',
        message: `Loaded demo node/relationship types and ${result.relationshipCount} relationships (${result.mode} mode).`,
      });
    } catch (err) {
      const normalized = toUserFacingError(err);
      setStatus({ type: 'error', message: normalized.message });
    } finally {
      setIsSaving(false);
    }
  }, [settings]);

  if (!settings) {
    return (
      <div style={{ padding: 24 }}>
        <PageNav activeTabId="graphlens_configuration" />
        <WaitSpinner size="medium" />
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <PageNav activeTabId="graphlens_configuration" />
      <h1>GraphLens configuration</h1>
      {!canManage && (
        <div className="graphlens-error-banner" role="status">
          You do not hold the graphlens_manage_config capability, so these values are shown
          read-only. Ask a GraphLens administrator to change them.
        </div>
      )}
      {status && (
        <div className={status.type === 'error' ? 'graphlens-error-banner' : 'graphlens-section'} role="status">
          {status.message}
        </div>
      )}

      <section className="graphlens-section">
        <h2>Graph limits</h2>
        <LimitsForm settings={settings} disabled={!canManage || isSaving} onSave={(values) => save('limits', values)} />
      </section>

      <section className="graphlens-section">
        <h2>Search defaults</h2>
        <SearchForm
          settings={settings}
          disabled={!canManage || isSaving}
          canUseSearchSource={canUseSearchSource}
          onSave={(values) => save('search', values)}
        />
      </section>

      <section className="graphlens-section">
        <h2>Features</h2>
        <FeaturesForm settings={settings} disabled={!canManage || isSaving} onSave={(values) => save('features', values)} />
      </section>

      <section className="graphlens-section">
        <h2>Demo data</h2>
        <DemoDataSection
          settings={settings}
          disabled={!canManageCollections || isSaving}
          canManageCollections={canManageCollections}
          onLoad={handleLoadDemoData}
        />
      </section>
    </div>
  );
}

function LimitsForm({ settings, disabled, onSave }) {
  const [values, setValues] = useState({
    max_visible_nodes: settings.maxVisibleNodes,
    max_visible_edges: settings.maxVisibleEdges,
    max_expansion_neighbours: settings.maxExpansionNeighbours,
    max_expansion_depth: settings.maxExpansionDepth,
    max_path_depth: settings.maxPathDepth,
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <NumberField label="Maximum visible nodes" value={values.max_visible_nodes} disabled={disabled} onChange={(v) => setValues((s) => ({ ...s, max_visible_nodes: v }))} />
      <NumberField label="Maximum visible edges" value={values.max_visible_edges} disabled={disabled} onChange={(v) => setValues((s) => ({ ...s, max_visible_edges: v }))} />
      <NumberField label="Maximum expansion neighbours" value={values.max_expansion_neighbours} disabled={disabled} onChange={(v) => setValues((s) => ({ ...s, max_expansion_neighbours: v }))} />
      <NumberField label="Maximum expansion depth" value={values.max_expansion_depth} disabled={disabled} onChange={(v) => setValues((s) => ({ ...s, max_expansion_depth: v }))} />
      <NumberField label="Maximum path-finder depth" value={values.max_path_depth} disabled={disabled} onChange={(v) => setValues((s) => ({ ...s, max_path_depth: v }))} />
      <Button label="Save graph limits" appearance="primary" disabled={disabled} onClick={() => onSave(values)} />
    </div>
  );
}

function SearchForm({ settings, disabled, canUseSearchSource, onSave }) {
  const [values, setValues] = useState({
    relationship_source_type: settings.relationshipSourceType,
    relationship_index: settings.relationshipIndex,
    relationship_lookup: settings.relationshipLookup,
    relationship_saved_search: settings.relationshipSavedSearch,
    evidence_default_index: settings.evidenceDefaultIndex,
  });
  const isLookup = values.relationship_source_type === 'lookup';
  const isSavedSearch = values.relationship_source_type === 'saved_search';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label htmlFor="graphlens-cfg-source-type" style={{ fontSize: 12 }}>
        Relationship data source
        <div>
          <Select
            inputId="graphlens-cfg-source-type"
            value={values.relationship_source_type}
            disabled={disabled}
            onChange={(e, { value }) => setValues((s) => ({ ...s, relationship_source_type: value }))}
          >
            <Select.Option label="Index (time-series events)" value="index" />
            <Select.Option label="Lookup (static table)" value="lookup" />
            <Select.Option
              label="Saved search (pre-authored results)"
              value="saved_search"
              disabled={!canUseSearchSource}
              description={canUseSearchSource ? undefined : 'Requires graphlens_use_search_source'}
            />
          </Select>
        </div>
      </label>
      {!canUseSearchSource && isSavedSearch && (
        <div className="graphlens-error-banner" role="status">
          This is already set to Saved search, but you do not hold the
          graphlens_use_search_source capability, so you cannot change it
          further. Ask a GraphLens administrator.
        </div>
      )}
      {values.relationship_source_type === 'index' && (
        <label htmlFor="graphlens-cfg-index" style={{ fontSize: 12 }}>
          Relationship index
          <Text inputId="graphlens-cfg-index" value={values.relationship_index} disabled={disabled} onChange={(e, { value }) => setValues((s) => ({ ...s, relationship_index: value }))} />
        </label>
      )}
      {isLookup && (
        <label htmlFor="graphlens-cfg-lookup" style={{ fontSize: 12 }}>
          Relationship lookup (lookup definition name, not a .csv filename)
          <Text inputId="graphlens-cfg-lookup" value={values.relationship_lookup} disabled={disabled} onChange={(e, { value }) => setValues((s) => ({ ...s, relationship_lookup: value }))} />
        </label>
      )}
      {isSavedSearch && (
        <label htmlFor="graphlens-cfg-saved-search" style={{ fontSize: 12 }}>
          Relationship saved search (name, not SPL - results must already be
          shaped to the relationship schema, see DATA_MODEL.md)
          <Text
            inputId="graphlens-cfg-saved-search"
            value={values.relationship_saved_search}
            disabled={disabled || !canUseSearchSource}
            onChange={(e, { value }) => setValues((s) => ({ ...s, relationship_saved_search: value }))}
          />
        </label>
      )}
      <label htmlFor="graphlens-cfg-evidence-index" style={{ fontSize: 12 }}>
        Default evidence index
        <Text inputId="graphlens-cfg-evidence-index" value={values.evidence_default_index} disabled={disabled} onChange={(e, { value }) => setValues((s) => ({ ...s, evidence_default_index: value }))} />
      </label>
      <Button label="Save search defaults" appearance="primary" disabled={disabled} onClick={() => onSave(values)} />
    </div>
  );
}

function FeaturesForm({ settings, disabled, onSave }) {
  const [values, setValues] = useState({
    enable_export: settings.enableExport,
    enable_annotations: settings.enableAnnotations,
    enable_saved_views: settings.enableSavedViews,
    enable_clustering: settings.enableClustering,
    enable_path_finder: settings.enablePathFinder,
    enable_graph_query: settings.enableGraphQuery,
    enable_time_slicer: settings.enableTimeSlicer,
    enable_style_overrides: settings.enableStyleOverrides,
  });
  const toggle = (key) => setValues((s) => ({ ...s, [key]: !s[key] }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Switch selected={values.enable_export} disabled={disabled} onClick={() => toggle('enable_export')}>Enable export</Switch>
      <Switch selected={values.enable_annotations} disabled={disabled} onClick={() => toggle('enable_annotations')}>Enable annotations</Switch>
      <Switch selected={values.enable_saved_views} disabled={disabled} onClick={() => toggle('enable_saved_views')}>Enable saved views</Switch>
      <Switch selected={values.enable_clustering} disabled={disabled} onClick={() => toggle('enable_clustering')}>Enable clustering</Switch>
      <Switch selected={values.enable_path_finder} disabled={disabled} onClick={() => toggle('enable_path_finder')}>Enable path finder</Switch>
      <Switch selected={values.enable_graph_query} disabled={disabled} onClick={() => toggle('enable_graph_query')}>Enable query language</Switch>
      <Switch selected={values.enable_time_slicer} disabled={disabled} onClick={() => toggle('enable_time_slicer')}>Enable time slicer</Switch>
      <Switch selected={values.enable_style_overrides} disabled={disabled} onClick={() => toggle('enable_style_overrides')}>Enable session style overrides</Switch>
      <Button label="Save features" appearance="primary" disabled={disabled} onClick={() => onSave(values)} />
    </div>
  );
}

function DemoDataSection({ settings, disabled, canManageCollections, onLoad }) {
  const isLookup = settings.relationshipSourceType === 'lookup';
  const isSavedSearch = settings.relationshipSourceType === 'saved_search';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ fontSize: 12, margin: 0 }}>
        Loads the bundled sample node/relationship types and a small set of
        sample relationships, so a fresh install can be explored
        immediately. This is the same data and process DATA_INGESTION.md
        and INSTALL.md describe for manual setup - this button just runs it
        for you.{' '}
        {isSavedSearch ? (
          <strong>
            Not available in Saved search mode: there is no bundled
            relationship data to load into a search you authored yourself.
            Switch Relationship data source above to Index or Lookup to use
            this button.
          </strong>
        ) : isLookup ? (
          <strong>
            Lookup mode: this replaces the entire contents of the
            configured relationship lookup (&quot;{settings.relationshipLookup}
            &quot;), which must already exist as a registered lookup
            definition (Settings &gt; Lookups &gt; Lookup table
            definitions).
          </strong>
        ) : (
          <strong>
            Index mode: this adds the sample relationships as new events to
            the configured index (&quot;{settings.relationshipIndex}
            &quot;) - it does not remove any existing data there, and that
            index must already exist.
          </strong>
        )}
        {!isSavedSearch && (
          <>
            {' '}It always replaces the current node/relationship type
            configuration (graphlens_node_types / graphlens_relationship_types).
          </>
        )}
      </p>
      {!canManageCollections && !isSavedSearch && (
        <div className="graphlens-error-banner" role="status">
          You do not hold the graphlens_manage_collections capability, so
          this action is unavailable. Ask a GraphLens administrator.
        </div>
      )}
      <Button label="Load demo data" appearance="destructive" disabled={disabled || isSavedSearch} onClick={onLoad} />
    </div>
  );
}

function NumberField({ label, value, disabled, onChange }) {
  const id = `graphlens-cfg-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <label htmlFor={id} style={{ fontSize: 12 }}>
      {label}
      <Number inputId={id} value={value} disabled={disabled} min={1} onChange={(e, { value: v }) => onChange(v)} />
    </label>
  );
}

const settingsShape = PropTypes.shape({
  maxVisibleNodes: PropTypes.number,
  maxVisibleEdges: PropTypes.number,
  maxExpansionNeighbours: PropTypes.number,
  maxExpansionDepth: PropTypes.number,
  maxPathDepth: PropTypes.number,
  relationshipSourceType: PropTypes.string,
  relationshipIndex: PropTypes.string,
  relationshipLookup: PropTypes.string,
  relationshipSavedSearch: PropTypes.string,
  evidenceDefaultIndex: PropTypes.string,
  enableExport: PropTypes.bool,
  enableAnnotations: PropTypes.bool,
  enableSavedViews: PropTypes.bool,
  enableClustering: PropTypes.bool,
  enablePathFinder: PropTypes.bool,
  enableGraphQuery: PropTypes.bool,
  enableTimeSlicer: PropTypes.bool,
  enableStyleOverrides: PropTypes.bool,
});

LimitsForm.propTypes = { settings: settingsShape.isRequired, disabled: PropTypes.bool.isRequired, onSave: PropTypes.func.isRequired };
SearchForm.propTypes = {
  settings: settingsShape.isRequired,
  disabled: PropTypes.bool.isRequired,
  canUseSearchSource: PropTypes.bool.isRequired,
  onSave: PropTypes.func.isRequired,
};
FeaturesForm.propTypes = { settings: settingsShape.isRequired, disabled: PropTypes.bool.isRequired, onSave: PropTypes.func.isRequired };
DemoDataSection.propTypes = {
  settings: settingsShape.isRequired,
  disabled: PropTypes.bool.isRequired,
  canManageCollections: PropTypes.bool.isRequired,
  onLoad: PropTypes.func.isRequired,
};
NumberField.propTypes = { label: PropTypes.string.isRequired, value: PropTypes.number.isRequired, disabled: PropTypes.bool.isRequired, onChange: PropTypes.func.isRequired };
