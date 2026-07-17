import { findShortestPath } from '../../src/main/webapp/shared/services/pathFinder';

const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }, { id: 'E' }];
const edges = [
  { id: 'ab', source: 'A', target: 'B' },
  { id: 'bc', source: 'B', target: 'C' },
  { id: 'cd', source: 'C', target: 'D' },
  { id: 'ae', source: 'A', target: 'E' },
];

test('finds the shortest path across multiple hops', () => {
  const result = findShortestPath(nodes, edges, 'A', 'D', 5);
  expect(result.nodeIds).toEqual(['A', 'B', 'C', 'D']);
  expect(result.edgeIds).toEqual(['ab', 'bc', 'cd']);
});

test('prefers the shorter of two routes', () => {
  const withShortcut = [...edges, { id: 'ad', source: 'A', target: 'D' }];
  const result = findShortestPath(nodes, withShortcut, 'A', 'D', 5);
  expect(result.nodeIds).toEqual(['A', 'D']);
});

test('returns null when no path exists within the visible graph', () => {
  const isolated = [{ id: 'A' }, { id: 'Z' }];
  const result = findShortestPath(isolated, [], 'A', 'Z', 5);
  expect(result).toBeNull();
});

test('returns null when either endpoint is not in the visible node set', () => {
  expect(findShortestPath(nodes, edges, 'A', 'not-visible', 5)).toBeNull();
});

test('respects maxDepth and does not find a path beyond it', () => {
  const result = findShortestPath(nodes, edges, 'A', 'D', 1);
  expect(result).toBeNull();
});

test('a node is trivially "connected" to itself', () => {
  const result = findShortestPath(nodes, edges, 'A', 'A', 5);
  expect(result).toEqual({ nodeIds: ['A'], edgeIds: [] });
});

test('treats edges as traversable in either direction for path-finding', () => {
  const result = findShortestPath(nodes, edges, 'C', 'A', 5);
  expect(result.nodeIds).toEqual(['C', 'B', 'A']);
});
