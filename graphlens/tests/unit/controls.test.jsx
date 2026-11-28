/**
 * Interaction tests for the controls added/changed in 1.25.0 (controls
 * review): search result keyboard selection, selectable Table view rows,
 * the Hidden nodes list, the on-graph path status, and the right-click
 * menu's arrow-key handling.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import EntitySearch from '../../src/main/webapp/pages/RelationshipExplorer/components/EntitySearch';
import GraphTableView from '../../src/main/webapp/pages/RelationshipExplorer/components/GraphTableView';
import HiddenNodesPanel from '../../src/main/webapp/pages/RelationshipExplorer/components/HiddenNodesPanel';
import PathStatusChip from '../../src/main/webapp/pages/RelationshipExplorer/components/PathStatusChip';
import { handleMenuArrowKeys } from '../../src/main/webapp/pages/RelationshipExplorer/components/menuKeyboard';

global.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (el) => act(() => { root.render(el); });
const key = (target, k) => act(() => {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
});

describe('EntitySearch - combobox keyboard pattern', () => {
  const results = [{ id: 'user:a', label: 'Alice', type: 'user' }, { id: 'user:b', label: 'Bob', type: 'user' }];

  test('ArrowDown moves the active option, Enter picks it, focus stays in the field', () => {
    const onPick = jest.fn();
    const onSearch = jest.fn();
    render(<EntitySearch isLoading={false} results={[]} onSearch={onSearch} onPickResult={onPick} />);
    const input = container.querySelector('#graphlens-entity-search');
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'a');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    key(input, 'Enter');
    expect(onSearch).toHaveBeenCalledWith('a');
    render(<EntitySearch isLoading={false} results={results} onSearch={onSearch} onPickResult={onPick} />);
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(2);
    key(input, 'ArrowDown');
    key(input, 'ArrowDown');
    expect(input.getAttribute('aria-activedescendant')).toBe('graphlens-entity-search-results-option-1');
    key(input, 'Enter');
    expect(onPick).toHaveBeenCalledWith(results[1]);
  });

  test('Escape closes the list; a press outside closes it too', () => {
    const onSearch = jest.fn();
    render(<EntitySearch isLoading={false} results={[]} onSearch={onSearch} onPickResult={jest.fn()} />);
    const input = container.querySelector('#graphlens-entity-search');
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'a');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    key(input, 'Enter');
    render(<EntitySearch isLoading={false} results={results} onSearch={onSearch} onPickResult={jest.fn()} />);
    expect(container.querySelector('[role="listbox"]')).not.toBeNull();
    key(input, 'Escape');
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    key(input, 'Enter');
    expect(container.querySelector('[role="listbox"]')).not.toBeNull();
    act(() => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });
});

describe('GraphTableView - selectable rows', () => {
  const nodes = [{ id: 'user:a', label: 'Alice', type: 'user' }, { id: 'host:h', label: 'h', type: 'host' }];
  const edges = [{ id: 'e1', source: 'user:a', target: 'host:h', relationship: 'R', relationshipLabel: 'Logged into' }];

  test('the first cell is a button that selects the node / relationship', () => {
    const onSelectNode = jest.fn();
    const onSelectEdge = jest.fn();
    render(<GraphTableView nodes={nodes} edges={edges} onSelectNode={onSelectNode} onSelectEdge={onSelectEdge} />);
    const buttons = container.querySelectorAll('button.graphlens-row-select');
    expect(buttons).toHaveLength(3);
    expect(buttons[2].getAttribute('aria-label')).toBe('Select relationship Logged into');
    act(() => buttons[1].click());
    expect(onSelectNode).toHaveBeenCalledWith('host:h');
    act(() => buttons[2].click());
    expect(onSelectEdge).toHaveBeenCalledWith('e1');
  });

  test('the selected row is marked', () => {
    render(<GraphTableView nodes={nodes} edges={edges} selectedNodeId="user:a" />);
    const selected = container.querySelectorAll('tr[aria-current="true"]');
    expect(selected).toHaveLength(1);
    expect(selected[0].textContent).toContain('Alice');
  });
});

describe('HiddenNodesPanel', () => {
  test('Show and Show all call back with the right ids', () => {
    const onShow = jest.fn();
    const onShowAll = jest.fn();
    render(<HiddenNodesPanel nodes={[{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]} onShow={onShow} onShowAll={onShowAll} />);
    const show = Array.from(container.querySelectorAll('button')).filter((b) => b.textContent.trim() === 'Show');
    act(() => show[1].click());
    expect(onShow).toHaveBeenCalledWith('b');
    const all = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Show all');
    act(() => all.click());
    expect(onShowAll).toHaveBeenCalled();
  });
});

describe('PathStatusChip', () => {
  const chip = (props) => {
    render(<PathStatusChip onClear={() => {}} maxDepth={5} {...props} />);
    return container.textContent;
  };
  test('says what to do next with only one end chosen', () => {
    expect(chip({ startLabel: 'A' })).toContain('choose "Path to here"');
    expect(chip({ endLabel: 'B' })).toContain('choose "Path from here"');
  });
  test('reports a found path and a missing one', () => {
    expect(chip({ startLabel: 'A', endLabel: 'B', searched: true, path: { nodeIds: ['a', 'x', 'b'], edgeIds: ['1', '2'] } })).toContain('3 nodes, 2 hops');
    expect(chip({ startLabel: 'A', endLabel: 'B', searched: true, path: null })).toContain('No path');
  });
  test('renders nothing with no ends chosen', () => {
    expect(chip({})).toBe('');
  });
});

describe('right-click menu arrow keys', () => {
  test('ArrowDown/ArrowUp/Home/End move focus between items, wrapping', () => {
    container.innerHTML = '<div id="m"><button role="menuitem">A</button><button role="menuitem">B</button><button role="menuitem">C</button></div>';
    const menu = container.querySelector('#m');
    const items = menu.querySelectorAll('[role="menuitem"]');
    const press = (k) => handleMenuArrowKeys({ key: k, currentTarget: menu, preventDefault: () => {} });
    items[0].focus();
    press('ArrowDown');
    expect(document.activeElement).toBe(items[1]);
    press('End');
    expect(document.activeElement).toBe(items[2]);
    press('ArrowDown');
    expect(document.activeElement).toBe(items[0]);
    press('ArrowUp');
    expect(document.activeElement).toBe(items[2]);
    press('Home');
    expect(document.activeElement).toBe(items[0]);
  });
});
