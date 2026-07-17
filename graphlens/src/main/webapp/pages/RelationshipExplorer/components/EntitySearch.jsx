import React, { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import Button from '@splunk/react-ui/Button';
import Text from '@splunk/react-ui/Text';
import Menu from '@splunk/react-ui/Menu';
import WaitSpinner from '@splunk/react-ui/WaitSpinner';

/**
 * Free-text entity search box. Validation/escaping of the term happens in
 * the caller (services/searchService via utilities/splSafety) - this
 * component only collects the raw term and renders the candidate list the
 * search returned.
 */
export default function EntitySearch({ isLoading, results, onSearch, onPickResult }) {
  const [term, setTerm] = useState('');
  const [showResults, setShowResults] = useState(false);

  const submit = useCallback(() => {
    if (term.trim().length === 0) return;
    setShowResults(true);
    onSearch(term);
  }, [term, onSearch]);

  const handleKeyDown = useCallback((event) => {
    if (event.key === 'Enter') submit();
    if (event.key === 'Escape') setShowResults(false);
  }, [submit]);

  return (
    <div style={{ position: 'relative', minWidth: 260 }}>
      <label htmlFor="graphlens-entity-search" className="graphlens-visually-hidden">
        Search for an entity
      </label>
      <div style={{ display: 'flex', gap: 6 }}>
        <Text
          inputId="graphlens-entity-search"
          value={term}
          onChange={(e, { value }) => setTerm(value)}
          onKeyDown={handleKeyDown}
          placeholder="Search for a user, host, IP, application..."
        />
        <Button label="Search" appearance="primary" onClick={submit} disabled={term.trim().length === 0} />
        {isLoading && <WaitSpinner size="small" />}
      </div>
      {showResults && results.length > 0 && (
        <Menu style={{ position: 'absolute', top: '100%', left: 0, zIndex: 20, maxHeight: 260, overflowY: 'auto' }}>
          {results.map((result) => (
            <Menu.Item
              key={result.id}
              onClick={() => {
                setShowResults(false);
                onPickResult(result);
              }}
            >
              {result.label} <span style={{ color: '#8a8a8a', marginLeft: 6 }}>({result.type})</span>
            </Menu.Item>
          ))}
        </Menu>
      )}
      {showResults && !isLoading && results.length === 0 && (
        <Menu style={{ position: 'absolute', top: '100%', left: 0, zIndex: 20 }}>
          <Menu.Item disabled>No matching entities found.</Menu.Item>
        </Menu>
      )}
    </div>
  );
}

EntitySearch.propTypes = {
  isLoading: PropTypes.bool.isRequired,
  results: PropTypes.array.isRequired,
  onSearch: PropTypes.func.isRequired,
  onPickResult: PropTypes.func.isRequired,
};
