import React from 'react';
import PropTypes from 'prop-types';
import TabBar from '@splunk/react-ui/TabBar';

import { getAppViewUrl } from '../utilities/restClient';

/**
 * GraphLens's three pages are separate Splunk `type="html"` views, each a
 * full page load with no client-side router between them - Splunk never
 * renders its own nav chrome around a view like this (see restClient.js's
 * getAppViewUrl for why), so without this there is no way to move between
 * Relationship Explorer, Health and Configuration at all once you've
 * landed on one of them.
 */
const PAGES = [
  { tabId: 'graphlens_relationship_explorer', label: 'Relationship Explorer' },
  { tabId: 'graphlens_health', label: 'Health' },
  { tabId: 'graphlens_configuration', label: 'Configuration' },
];

export default function PageNav({ activeTabId }) {
  return (
    <TabBar activeTabId={activeTabId} aria-label="GraphLens pages">
      {PAGES.map((p) => (
        <TabBar.Tab key={p.tabId} tabId={p.tabId} label={p.label} to={getAppViewUrl(p.tabId)} />
      ))}
    </TabBar>
  );
}

PageNav.propTypes = {
  activeTabId: PropTypes.string.isRequired,
};
