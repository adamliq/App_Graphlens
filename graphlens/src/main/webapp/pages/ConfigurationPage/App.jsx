import React, { useEffect, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import Button from '@splunk/react-ui/Button';
import Number from '@splunk/react-ui/Number';
import Switch from '@splunk/react-ui/Switch';
import Text from '@splunk/react-ui/Text';
import WaitSpinner from '@splunk/react-ui/WaitSpinner';

import { getSettings, updateSettingsStanza } from '../../shared/services/configService';
import { hasCapability, CAPABILITIES } from '../../shared/services/capabilityService';
import { recordAuditEvent, AUDIT_ACTIONS } from '../../shared/services/auditService';
import { toUserFacingError } from '../../shared/utilities/restClient';

export default function App() {
  const [settings, setSettings] = useState(null);
  const [canManage, setCanManage] = useState(false);
  const [status, setStatus] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const reload = useCallback(async () => {
    const [loadedSettings, allowed] = await Promise.all([
      getSettings(),
      hasCapability(CAPABILITIES.MANAGE_CONFIG),
    ]);
    setSettings(loadedSettings);
    setCanManage(allowed);
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

  if (!settings) {
    return <div style={{ padding: 24 }}><WaitSpinner size="medium" /></div>;
  }

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
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
        <SearchForm settings={settings} disabled={!canManage || isSaving} onSave={(values) => save('search', values)} />
      </section>

      <section className="graphlens-section">
        <h2>Features</h2>
        <FeaturesForm settings={settings} disabled={!canManage || isSaving} onSave={(values) => save('features', values)} />
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

function SearchForm({ settings, disabled, onSave }) {
  const [values, setValues] = useState({
    relationship_index: settings.relationshipIndex,
    evidence_default_index: settings.evidenceDefaultIndex,
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label htmlFor="graphlens-cfg-index" style={{ fontSize: 12 }}>
        Relationship index
        <Text inputId="graphlens-cfg-index" value={values.relationship_index} disabled={disabled} onChange={(e, { value }) => setValues((s) => ({ ...s, relationship_index: value }))} />
      </label>
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
  });
  const toggle = (key) => setValues((s) => ({ ...s, [key]: !s[key] }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Switch selected={values.enable_export} disabled={disabled} onClick={() => toggle('enable_export')}>Enable export</Switch>
      <Switch selected={values.enable_annotations} disabled={disabled} onClick={() => toggle('enable_annotations')}>Enable annotations</Switch>
      <Switch selected={values.enable_saved_views} disabled={disabled} onClick={() => toggle('enable_saved_views')}>Enable saved views</Switch>
      <Switch selected={values.enable_clustering} disabled={disabled} onClick={() => toggle('enable_clustering')}>Enable clustering</Switch>
      <Switch selected={values.enable_path_finder} disabled={disabled} onClick={() => toggle('enable_path_finder')}>Enable path finder</Switch>
      <Button label="Save features" appearance="primary" disabled={disabled} onClick={() => onSave(values)} />
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
  relationshipIndex: PropTypes.string,
  evidenceDefaultIndex: PropTypes.string,
  enableExport: PropTypes.bool,
  enableAnnotations: PropTypes.bool,
  enableSavedViews: PropTypes.bool,
  enableClustering: PropTypes.bool,
  enablePathFinder: PropTypes.bool,
});

LimitsForm.propTypes = { settings: settingsShape.isRequired, disabled: PropTypes.bool.isRequired, onSave: PropTypes.func.isRequired };
SearchForm.propTypes = { settings: settingsShape.isRequired, disabled: PropTypes.bool.isRequired, onSave: PropTypes.func.isRequired };
FeaturesForm.propTypes = { settings: settingsShape.isRequired, disabled: PropTypes.bool.isRequired, onSave: PropTypes.func.isRequired };
NumberField.propTypes = { label: PropTypes.string.isRequired, value: PropTypes.number.isRequired, disabled: PropTypes.bool.isRequired, onChange: PropTypes.func.isRequired };
