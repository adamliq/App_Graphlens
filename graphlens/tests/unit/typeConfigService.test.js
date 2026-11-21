import {
  colorForType,
  resolveDistinctColors,
  deriveNodeTypeList,
  deriveRelationshipTypeList,
} from '../../src/main/webapp/shared/services/typeConfigService';
import { STATUS_COLORS } from '../../src/main/webapp/pages/RelationshipExplorer/components/GraphCanvas';

describe('colorForType', () => {
  test('is deterministic for the same type name', () => {
    expect(colorForType('user')).toBe(colorForType('user'));
  });

  test('never returns one of the fixed status-indicator colours', () => {
    const statusColors = new Set(Object.values(STATUS_COLORS));
    const sampleTypes = ['user', 'host', 'ip', 'process', 'alert', 'group', 'domain', 'server',
      'AUTHENTICATED_TO', 'CONNECTED_TO', 'RAN_PROCESS', 'TRIGGERED', 'MEMBER_OF', 'OWNS'];
    sampleTypes.forEach((t) => {
      expect(statusColors.has(colorForType(t))).toBe(false);
    });
  });
});

describe('resolveDistinctColors', () => {
  test('keeps the first occurrence of a colour and reassigns later duplicates', () => {
    const resolved = resolveDistinctColors([
      { key: 'alpha', color: '#111111' },
      { key: 'beta', color: '#111111' },
      { key: 'gamma', color: '#222222' },
    ]);
    // "alpha" sorts before "beta" - alpha keeps the shared colour, beta is bumped.
    expect(resolved.get('alpha')).toBe('#111111');
    expect(resolved.get('beta')).not.toBe('#111111');
    expect(resolved.get('gamma')).toBe('#222222');
    expect(new Set(resolved.values()).size).toBe(3);
  });

  test('is order-independent given the same set of entries', () => {
    const entries = [
      { key: 'beta', color: '#111111' },
      { key: 'alpha', color: '#111111' },
    ];
    const reversedEntries = [...entries].reverse();
    expect(Array.from(resolveDistinctColors(entries).entries())).toEqual(
      Array.from(resolveDistinctColors(reversedEntries).entries()),
    );
  });

  test('does not throw and degrades gracefully when more entries than palette colours collide', () => {
    const manyEntries = Array.from({ length: 50 }, (_, i) => ({ key: `type${i}`, color: '#111111' }));
    const resolved = resolveDistinctColors(manyEntries);
    expect(resolved.size).toBe(50);
  });
});

describe('deriveNodeTypeList / deriveRelationshipTypeList - colours are distinct for what is currently visible', () => {
  test('a realistic small set of uncurated node types never collides (confirmed live before this fix - user/group/ip/alert/host all shared a colour)', () => {
    const nodes = ['user', 'group', 'ip', 'alert', 'host', 'process', 'domain'].map((type, i) => ({ type, id: `n${i}` }));
    const list = deriveNodeTypeList(nodes, {});
    const colors = list.map((nt) => nt.color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  test('a realistic small set of uncurated relationship types never collides', () => {
    const edges = ['AUTHENTICATED_TO', 'CONNECTED_TO', 'RAN_PROCESS', 'TRIGGERED', 'MEMBER_OF', 'OWNS'].map((relationship, i) => ({ relationship, id: `e${i}` }));
    const list = deriveRelationshipTypeList(edges, {});
    const colors = list.map((rt) => rt.color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  test('a large number of distinct uncurated types (more than the palette) still maximises distinctness rather than defaulting to heavy collision', () => {
    const nodes = Array.from({ length: 30 }, (_, i) => ({ type: `type${i}`, id: `n${i}` }));
    const list = deriveNodeTypeList(nodes, {});
    const colors = list.map((nt) => nt.color);
    // Palette has 19 colours - expect at least that many distinct colours used.
    expect(new Set(colors).size).toBeGreaterThanOrEqual(19);
  });

  test('explicit curated colours are respected and still de-duplicated against each other', () => {
    const nodes = [{ type: 'user', id: 'n1' }, { type: 'host', id: 'n2' }];
    const config = {
      user: { display_label: 'User', color: '#ABCDEF' },
      host: { display_label: 'Host', color: '#ABCDEF' },
    };
    const list = deriveNodeTypeList(nodes, config);
    const colors = list.map((nt) => nt.color);
    expect(new Set(colors).size).toBe(2);
    // "host" sorts before "user" alphabetically, so host keeps the curated colour.
    expect(list.find((nt) => nt.node_type === 'host').color).toBe('#ABCDEF');
  });
});
