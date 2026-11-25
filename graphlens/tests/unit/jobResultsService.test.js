import { classifyJobResultRows } from '../../src/main/webapp/shared/services/jobResultsService';

describe('classifyJobResultRows', () => {
  test('splits edge rows (source_id + target_id + relationship_type) from node rows (node_id)', () => {
    const rows = [
      { node_id: 'user:jsmith', node_type: 'user', node_label: 'J Smith' },
      { source_id: 'user:jsmith', target_id: 'host:server01', relationship_type: 'AUTHENTICATED_TO' },
    ];
    const { nodeRows, edgeRows, droppedCount } = classifyJobResultRows(rows);
    expect(nodeRows).toHaveLength(1);
    expect(edgeRows).toHaveLength(1);
    expect(droppedCount).toBe(0);
  });

  test('drops rows matching neither shape, reporting a count rather than throwing', () => {
    const rows = [
      { some_field: 'irrelevant' },
      { source_id: 'a', target_id: 'b' }, // missing relationship_type
      {},
    ];
    const { nodeRows, edgeRows, droppedCount } = classifyJobResultRows(rows);
    expect(nodeRows).toHaveLength(0);
    expect(edgeRows).toHaveLength(0);
    expect(droppedCount).toBe(3);
  });

  test('a row with both node_id and full edge fields is treated as an edge row', () => {
    const rows = [
      { node_id: 'user:jsmith', source_id: 'user:jsmith', target_id: 'host:server01', relationship_type: 'AUTHENTICATED_TO' },
    ];
    const { nodeRows, edgeRows } = classifyJobResultRows(rows);
    expect(nodeRows).toHaveLength(0);
    expect(edgeRows).toHaveLength(1);
  });

  test('handles null/undefined/non-array input without throwing', () => {
    expect(classifyJobResultRows(null)).toEqual({ nodeRows: [], edgeRows: [], droppedCount: 0 });
    expect(classifyJobResultRows(undefined)).toEqual({ nodeRows: [], edgeRows: [], droppedCount: 0 });
  });
});
