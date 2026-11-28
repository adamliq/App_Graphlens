/**
 * @jest-environment node
 */
/**
 * Renders the real components that show node/edge display text with
 * malicious labels and checks the produced markup: since 1.22.0 labels
 * are stored as plain text (see xss.test.js), so this is where the
 * "React escapes it as text content" half of the guarantee is proven
 * rather than assumed. Also pins the user-visible half of the 1.22.0
 * fix: "AT&T" is rendered as AT&amp;T in markup (i.e. shown as "AT&T"),
 * never the double-escaped AT&amp;amp;T (shown as "AT&amp;T").
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import NodeDetailsPanel from '../../src/main/webapp/pages/RelationshipExplorer/components/NodeDetailsPanel';
import EdgeDetailsPanel from '../../src/main/webapp/pages/RelationshipExplorer/components/EdgeDetailsPanel';
import EditUndoNotification from '../../src/main/webapp/pages/RelationshipExplorer/components/EditUndoNotification';
import GraphTableView from '../../src/main/webapp/pages/RelationshipExplorer/components/GraphTableView';

const PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '"><svg onload=alert(1)>',
  '<iframe src="javascript:alert(1)"></iframe>',
  '<svg/onload=alert(1)>',
];

// The components legitimately render their own icon <svg>s (1.23.0), so
// "no <svg> at all" is not the test. Instead every real tag in the output
// is inspected: none may be a script/img/iframe, and none may carry an
// event-handler attribute - escaped payload *text* (&lt;img onerror=...)
// is inert and is not a tag. The payload must also never appear verbatim.
function dangerousTags(html) {
  const tags = html.match(/<[a-z][^>]*>/gi) || [];
  // Quoted attribute *values* are text (React escapes them) - e.g. an
  // aria-label naming a node whose label is a payload - so they are
  // blanked out before looking for an event-handler attribute *name*.
  return tags.filter((tag) => {
    const withoutValues = tag.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
    return /^<(script|img|iframe)\b/i.test(withoutValues) || /\son[a-z]+\s*=/i.test(withoutValues);
  });
}

const noop = () => {};

function node(label) {
  return { id: 'user:jsmith', type: 'user', label, description: label, group: 'g', riskScore: 10, eventCount: 1 };
}

function edge(label) {
  return { id: 'e1', source: 'user:jsmith', target: 'host:server01', relationship: 'AUTHENTICATED_TO', relationshipLabel: label, directed: true, riskScore: 10, eventCount: 1 };
}

function renderNodePanel(label) {
  return renderToStaticMarkup(
    <NodeDetailsPanel
      node={node(label)}
      isExpanded={false}
      isPinned={false}
      canEdit
      onExpand={noop}
      onCollapse={noop}
      onHide={noop}
      onPin={noop}
      onUnpin={noop}
      onViewEvidence={noop}
      onSetPathStart={noop}
      onSetPathEnd={noop}
    />,
  );
}

describe('the dangerous-tag check itself', () => {
  test('flags raw payload markup but not escaped text or a plain icon svg', () => {
    expect(dangerousTags('<div><img src=x onerror=alert(1)></div>')).toHaveLength(1);
    expect(dangerousTags('<svg onload=alert(1)>')).toHaveLength(1);
    expect(dangerousTags('<div>&lt;img src=x onerror=alert(1)&gt;</div>')).toEqual([]);
    expect(dangerousTags('<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M0 0"></path></svg>')).toEqual([]);
    // An escaped payload inside an attribute value is text, not a handler...
    expect(dangerousTags('<button aria-label="Select node &lt;img src=x onerror=alert(1)&gt;">')).toEqual([]);
    // ...but a real handler attribute is still caught.
    expect(dangerousTags('<button aria-label="x" onclick="alert(1)">')).toHaveLength(1);
  });
});

describe('components that show display text render it as escaped text, never as markup', () => {
  test.each(PAYLOADS)('NodeDetailsPanel: %j', (payload) => {
    const html = renderNodePanel(payload);
    expect(dangerousTags(html)).toEqual([]);
    expect(html).not.toContain(payload);
    expect(html).toContain('&lt;');
  });

  test.each(PAYLOADS)('EdgeDetailsPanel: %j', (payload) => {
    const html = renderToStaticMarkup(<EdgeDetailsPanel edge={edge(payload)} onViewEvidence={noop} />);
    expect(dangerousTags(html)).toEqual([]);
    expect(html).not.toContain(payload);
    expect(html).toContain('&lt;');
  });

  test.each(PAYLOADS)('EditUndoNotification: %j', (payload) => {
    const html = renderToStaticMarkup(<EditUndoNotification lastEdit={{ label: payload }} onUndo={noop} onDismiss={noop} />);
    expect(dangerousTags(html)).toEqual([]);
    expect(html).not.toContain(payload);
    expect(html).toContain('&lt;');
  });

  test.each(PAYLOADS)('GraphTableView: %j', (payload) => {
    const html = renderToStaticMarkup(<GraphTableView nodes={[node(payload)]} edges={[edge(payload)]} />);
    expect(dangerousTags(html)).toEqual([]);
    expect(html).not.toContain(payload);
    expect(html).toContain('&lt;');
  });
});

describe('legitimate text with HTML-special characters is shown as written, not double-escaped (1.22.0)', () => {
  test('NodeDetailsPanel shows "AT&T"', () => {
    const html = renderNodePanel('AT&T');
    expect(html).toContain('AT&amp;T');
    expect(html).not.toContain('AT&amp;amp;T');
  });

  test('EdgeDetailsPanel shows "R&D access"', () => {
    const html = renderToStaticMarkup(<EdgeDetailsPanel edge={edge('R&D access')} onViewEvidence={noop} />);
    expect(html).toContain('R&amp;D access');
    expect(html).not.toContain('&amp;amp;');
  });

  test('GraphTableView shows "AT&T"', () => {
    const html = renderToStaticMarkup(<GraphTableView nodes={[node('AT&T')]} edges={[]} />);
    expect(html).toContain('AT&amp;T');
    expect(html).not.toContain('&amp;amp;');
  });
});
