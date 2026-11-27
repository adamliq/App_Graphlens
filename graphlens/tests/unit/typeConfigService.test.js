import fs from 'fs';
import path from 'path';
import {
  colorForType,
  shapeForType,
  normalizeShape,
  resolveDistinctColors,
  deriveNodeTypeList,
  deriveRelationshipTypeList,
  FALLBACK_PALETTE,
  AUTO_SHAPES,
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

  test('a large number of distinct uncurated types (more than the palette) still gets a distinct colour+shape pair each', () => {
    const nodes = Array.from({ length: 30 }, (_, i) => ({ type: `type${i}`, id: `n${i}` }));
    const list = deriveNodeTypeList(nodes, {});
    const pairs = list.map((nt) => `${nt.color}|${nt.shape}`);
    expect(new Set(pairs).size).toBe(30);
  });

  test('curated types sharing a colour AND a shape are de-duplicated (1.24.0: by the pair)', () => {
    const nodes = [{ type: 'user', id: 'n1' }, { type: 'host', id: 'n2' }];
    const config = {
      user: { display_label: 'User', color: '#ABCDEF', shape: 'ellipse' },
      host: { display_label: 'Host', color: '#ABCDEF', shape: 'ellipse' },
    };
    const list = deriveNodeTypeList(nodes, config);
    expect(new Set(list.map((nt) => nt.color)).size).toBe(2);
    // "host" sorts before "user" alphabetically, so host keeps the curated colour.
    expect(list.find((nt) => nt.node_type === 'host').color).toBe('#ABCDEF');
  });

  test('curated types sharing a colour but not a shape both keep their curated colour (1.24.0: a type no longer changes colour between graphs)', () => {
    const nodes = [{ type: 'user', id: 'n1' }, { type: 'group', id: 'n2' }];
    const config = {
      user: { color: '#ABCDEF', shape: 'ellipse' },
      group: { color: '#ABCDEF', shape: 'round-rectangle' },
    };
    const list = deriveNodeTypeList(nodes, config);
    expect(list.every((nt) => nt.color === '#ABCDEF')).toBe(true);
    expect(list.map((nt) => nt.shape).sort()).toEqual(['ellipse', 'round-rectangle']);
  });

  test('a curated type with no or an unsupported shape gets an automatic one ("cylinder" was in the pre-1.24 seed)', () => {
    const list = deriveNodeTypeList([{ type: 'database', id: 'n1' }], { database: { color: '#5380E3', shape: 'cylinder' } });
    expect(AUTO_SHAPES).toContain(list[0].shape);
  });
});

function hexToRgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
const CANVAS = '#fafafa';

describe('colour contrast of everything drawn on the canvas (WCAG 2.2 1.4.11, 3:1) - 1.24.0', () => {
  test.each(FALLBACK_PALETTE)('fallback palette colour %s is >= 3:1 against the canvas', (color) => {
    expect(contrast(color, CANVAS)).toBeGreaterThanOrEqual(3);
  });

  test.each(Object.entries(STATUS_COLORS))('status colour %s (%s) is >= 3:1 against the canvas', (_name, color) => {
    expect(contrast(color, CANVAS)).toBeGreaterThanOrEqual(3);
  });

  test('no status colour is also a palette colour', () => {
    const palette = new Set(FALLBACK_PALETTE.map((c) => c.toLowerCase()));
    Object.values(STATUS_COLORS).forEach((c) => expect(palette.has(c.toLowerCase())).toBe(false));
  });

  const lookups = path.join(__dirname, '../../lookups');
  const parseCsv = (file) => {
    const [header, ...lines] = fs.readFileSync(path.join(lookups, file), 'utf8').trim().split('\n');
    const cols = header.split(',');
    return lines.map((line) => Object.fromEntries(line.split(',').map((v, i) => [cols[i], v])));
  };
  const nodeSeeds = parseCsv('graphlens_node_types_seed.csv');
  const relSeeds = parseCsv('graphlens_relationship_types_seed.csv');

  test.each(nodeSeeds.map((r) => [r.node_type, r.color]))('seed node type %s colour %s is >= 3:1 against the canvas', (_t, color) => {
    expect(contrast(color, CANVAS)).toBeGreaterThanOrEqual(3);
  });

  test.each(relSeeds.map((r) => [r.relationship_type, r.color]))('seed relationship type %s colour %s is >= 3:1 against the canvas', (_t, color) => {
    expect(contrast(color, CANVAS)).toBeGreaterThanOrEqual(3);
  });

  test('every seed node type has a shape Cytoscape supports, and a colour+shape pair no other seed type has', () => {
    nodeSeeds.forEach((r) => expect(normalizeShape(r.shape)).toBe(r.shape));
    const pairs = nodeSeeds.map((r) => `${r.color}|${r.shape}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });
});

describe('shapeForType / normalizeShape (1.24.0)', () => {
  test('shapeForType is deterministic and always a supported shape', () => {
    expect(shapeForType('user')).toBe(shapeForType('user'));
    ['user', 'host', 'ip', 'x', ''].forEach((t) => expect(AUTO_SHAPES).toContain(shapeForType(t)));
  });

  test('normalizeShape rejects unsupported or non-string shapes', () => {
    expect(normalizeShape('cylinder')).toBeNull();
    expect(normalizeShape(undefined)).toBeNull();
    expect(normalizeShape('diamond')).toBe('diamond');
  });
});

describe('deriveNodeTypeList returns a shape for every type', () => {
  test('uncurated types get an automatic shape', () => {
    const list = deriveNodeTypeList([{ type: 'user', id: 'n1' }], {});
    expect(list[0].shape).toBe(shapeForType('user'));
  });
});
