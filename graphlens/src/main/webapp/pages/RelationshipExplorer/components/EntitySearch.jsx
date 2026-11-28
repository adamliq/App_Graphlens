import React, { useState, useCallback, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import Button from '@splunk/react-ui/Button';
import Text from '@splunk/react-ui/Text';
import WaitSpinner from '@splunk/react-ui/WaitSpinner';
import Magnifier from '@splunk/react-icons/Magnifier';

/**
 * Free-text entity search box. Validation/escaping of the term happens in
 * the caller (services/searchService via utilities/splSafety) - this
 * component only collects the raw term and renders the candidate list the
 * search returned.
 *
 * 1.25.0: the result list follows the WAI-ARIA combobox pattern - focus
 * stays in the text field, ArrowDown/ArrowUp move an active option
 * (announced via aria-activedescendant), Enter picks the active option
 * (or runs the search when none is active), Escape closes the list, and
 * a click anywhere outside closes it. Previously the list could only be
 * reached by tabbing past the Search button, arrows did nothing, and it
 * stayed open over the canvas after clicking elsewhere.
 */
export default function EntitySearch({ isLoading, results, onSearch, onPickResult }) {
  const [term, setTerm] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const listId = 'graphlens-entity-search-results';

  const submit = useCallback(() => {
    if (term.trim().length === 0) return;
    setShowResults(true);
    setActiveIndex(-1);
    onSearch(term);
  }, [term, onSearch]);

  const pick = useCallback((result) => {
    setShowResults(false);
    setActiveIndex(-1);
    onPickResult(result);
  }, [onPickResult]);

  const listOpen = showResults && results.length > 0;

  const handleKeyDown = useCallback((event) => {
    if (event.key === 'ArrowDown' && listOpen) {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (event.key === 'ArrowUp' && listOpen) {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (event.key === 'Enter') {
      if (listOpen && activeIndex >= 0) pick(results[activeIndex]);
      else submit();
    } else if (event.key === 'Escape') {
      setShowResults(false);
      setActiveIndex(-1);
    }
  }, [listOpen, results, activeIndex, pick, submit]);

  // Close the list on any pointer press outside the search box.
  useEffect(() => {
    if (!showResults) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setShowResults(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [showResults]);

  const optionId = (i) => `${listId}-option-${i}`;

  // @splunk/react-ui's Text spreads extra props onto its wrapper, not the
  // <input>, so the combobox ARIA state is applied to the input directly.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('aria-expanded', listOpen ? 'true' : 'false');
    input.setAttribute('aria-controls', listId);
    if (listOpen && activeIndex >= 0) input.setAttribute('aria-activedescendant', optionId(activeIndex));
    else input.removeAttribute('aria-activedescendant');
  });

  return (
    <div ref={rootRef} style={{ position: 'relative', minWidth: 184 }}>
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
          style={{ width: 184 }}
          inputRef={inputRef}
        />
        {/*
          1.23.0: the spinner replaces the button's own icon while a search
          runs, instead of appearing beside it - so the toolbar does not
          grow (and re-wrap) for the duration of every search.
        */}
        <Button
          label="Search"
          icon={isLoading ? <WaitSpinner size="small" /> : <Magnifier />}
          appearance="primary"
          onClick={submit}
          disabled={term.trim().length === 0}
        />
      </div>
      {listOpen && (
        <ul id={listId} role="listbox" aria-label="Matching entities" className="graphlens-search-results">
          {results.map((result, i) => (
            <li
              key={result.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === activeIndex}
              className={i === activeIndex ? 'graphlens-search-option graphlens-search-option-active' : 'graphlens-search-option'}
              // mousedown, not click: keeps focus in the field and beats the
              // outside-press listener above.
              onMouseDown={(event) => { event.preventDefault(); pick(result); }}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <span>{result.label}</span>
              <span className="graphlens-search-option-type">{result.type}</span>
            </li>
          ))}
        </ul>
      )}
      {showResults && !isLoading && results.length === 0 && (
        <div className="graphlens-search-results graphlens-search-empty" role="status">No matching entities found.</div>
      )}
      <span className="graphlens-visually-hidden" role="status" aria-live="polite">
        {listOpen ? `${results.length} matching ${results.length === 1 ? 'entity' : 'entities'}. Use the arrow keys to choose, Enter to open.` : ''}
      </span>
    </div>
  );
}

EntitySearch.propTypes = {
  isLoading: PropTypes.bool.isRequired,
  results: PropTypes.array.isRequired,
  onSearch: PropTypes.func.isRequired,
  onPickResult: PropTypes.func.isRequired,
};
