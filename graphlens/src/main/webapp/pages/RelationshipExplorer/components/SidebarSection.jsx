import React from 'react';
import PropTypes from 'prop-types';
import ChevronDown from '@splunk/react-icons/ChevronDown';
import ChevronRight from '@splunk/react-icons/ChevronRight';

/**
 * A collapsible left-sidebar section (1.23.0). The sidebar had grown to
 * about ten always-open panels in one long scroll; each is now wrapped in
 * one of these, with a heading that toggles it. The heading keeps the id
 * the panel's own <h3> used to carry, so every existing
 * aria-labelledby reference still resolves. The body is hidden, not
 * unmounted, when collapsed - a half-typed query or saved-view name
 * survives collapsing and reopening the section.
 */
export default function SidebarSection({ sectionId, title, headingId, open, onToggle, badge, children }) {
  const bodyId = `graphlens-sidebar-body-${sectionId}`;
  return (
    <section className="graphlens-sidebar-section">
      <h3 id={headingId} className="graphlens-sidebar-heading">
        <button
          type="button"
          className="graphlens-sidebar-toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => onToggle(sectionId)}
        >
          <span className="graphlens-sidebar-chevron" aria-hidden="true">{open ? <ChevronDown /> : <ChevronRight />}</span>
          <span className="graphlens-sidebar-title">{title}</span>
          {badge !== null && badge !== undefined && <span className="graphlens-count-badge">{badge}</span>}
        </button>
      </h3>
      <div id={bodyId} className="graphlens-sidebar-body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}

SidebarSection.propTypes = {
  sectionId: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  headingId: PropTypes.string,
  open: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  badge: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  children: PropTypes.node.isRequired,
};

SidebarSection.defaultProps = { headingId: undefined, badge: null };
