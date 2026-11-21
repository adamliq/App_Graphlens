import React, { useState } from 'react';
import PropTypes from 'prop-types';
import Button from '@splunk/react-ui/Button';
import Text from '@splunk/react-ui/Text';

/**
 * Save the current exploration as a named "recipe" (which node to start
 * from, which of its neighbours were expanded, filters, layout) and load
 * it back later - see savedViewsService.js for why this replays live
 * searches rather than restoring a frozen snapshot, and why it only
 * works for a graph that started from a single search result. Private to
 * the current user in this release (no sharing UI yet, even though the
 * underlying collection already has a column for it).
 */
export default function SavedViewsPanel({ views, isLoading, error, onSave, onLoad, onDelete }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [localError, setLocalError] = useState(null);

  const handleSaveClick = () => {
    if (!name.trim()) {
      setLocalError('Give this view a name.');
      return;
    }
    setLocalError(null);
    onSave(name.trim(), description.trim());
    setName('');
    setDescription('');
  };

  const displayError = localError || (error && error.message);

  return (
    <div className="graphlens-section">
      <h3 id="graphlens-saved-views-heading">Saved views</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} aria-labelledby="graphlens-saved-views-heading">
        <label htmlFor="graphlens-saved-view-name" style={{ fontSize: 12 }}>
          Name
          <Text inputId="graphlens-saved-view-name" value={name} onChange={(e, { value }) => setName(value)} />
        </label>
        <label htmlFor="graphlens-saved-view-description" style={{ fontSize: 12 }}>
          Description (optional)
          <Text inputId="graphlens-saved-view-description" value={description} onChange={(e, { value }) => setDescription(value)} />
        </label>
        <div className="graphlens-actions-row">
          <Button label="Save current view" appearance="primary" onClick={handleSaveClick} />
        </div>
        {displayError && <p role="alert" style={{ fontSize: 12, color: '#7a1f1f' }}>{displayError}</p>}

        {isLoading && <p style={{ fontSize: 12 }}>Loading...</p>}
        {!isLoading && views.length === 0 && (
          <p style={{ fontSize: 12, color: '#8a8a8a' }}>No saved views yet.</p>
        )}
        {!isLoading && views.length > 0 && (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {views.map((v) => (
              <li key={v.viewId} style={{ marginBottom: 8, fontSize: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <strong style={{ flex: 1 }}>{v.viewName}</strong>
                  <Button label="Load" onClick={() => onLoad(v)} />
                  <Button label="Delete" onClick={() => onDelete(v.viewId)} />
                </div>
                {v.description && <div style={{ color: '#5c5c5c' }}>{v.description}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

SavedViewsPanel.propTypes = {
  views: PropTypes.array.isRequired,
  isLoading: PropTypes.bool,
  error: PropTypes.shape({ message: PropTypes.string }),
  onSave: PropTypes.func.isRequired,
  onLoad: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};

SavedViewsPanel.defaultProps = { isLoading: false, error: null };
