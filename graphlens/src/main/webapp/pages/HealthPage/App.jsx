import React, { useEffect, useState } from 'react';
import WaitSpinner from '@splunk/react-ui/WaitSpinner';
import Button from '@splunk/react-ui/Button';

import { dispatchSavedSearch, toUserFacingError } from '../../shared/services/searchService';
import { getSettings } from '../../shared/services/configService';
import { hasCapability, CAPABILITIES } from '../../shared/services/capabilityService';

const APP_VERSION = '1.0.0';

export default function App() {
  const [canView, setCanView] = useState(null);
  const [settings, setSettings] = useState(null);
  const [rows, setRows] = useState([]);
  const [fieldOrder, setFieldOrder] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [allowed, loadedSettings] = await Promise.all([
        hasCapability(CAPABILITIES.VIEW_HEALTH),
        getSettings(),
      ]);
      setCanView(allowed);
      setSettings(loadedSettings);
      if (!allowed) {
        setIsLoading(false);
        return;
      }
      const job = dispatchSavedSearch('graphlens_health', {}, { maxWaitMs: 30000 });
      const { rows: resultRows, fieldOrder: order } = await job.waitForResults({ count: 200 });
      setRows(resultRows);
      setFieldOrder(order);
    } catch (err) {
      setError(toUserFacingError(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (canView === false) {
    return (
      <div style={{ padding: 24 }}>
        <h1>GraphLens health</h1>
        <p>You do not hold the graphlens_view_health capability required to view this page.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>GraphLens health</h1>
      <dl style={{ fontSize: 13 }}>
        <dt>Application version</dt>
        <dd>{APP_VERSION}</dd>
        <dt>Relationship index</dt>
        <dd>{settings ? settings.relationshipIndex : '...'}</dd>
        <dt>Configuration status</dt>
        <dd>{settings ? 'Loaded' : 'Unavailable'}</dd>
      </dl>
      <Button label="Refresh" onClick={load} />
      {isLoading && <WaitSpinner size="medium" />}
      {error && <p role="alert" style={{ color: '#7a1f1f' }}>{error.message}</p>}
      {!isLoading && !error && rows.length === 0 && (
        <p>No audited actions were recorded in the last 7 days.</p>
      )}
      {!isLoading && rows.length > 0 && (
        <table style={{ fontSize: 12, borderCollapse: 'collapse', marginTop: 12 }}>
          <thead>
            <tr>
              {fieldOrder.map((f) => (
                <th key={f} style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '4px 10px' }}>{f}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              // eslint-disable-next-line react/no-array-index-key
              <tr key={idx}>
                {fieldOrder.map((f) => (
                  <td key={f} style={{ padding: '4px 10px', borderBottom: '1px solid #eee' }}>{String(row[f] ?? '')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
