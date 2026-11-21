import { parseGraphQuery, MAX_QUERY_LENGTH } from '../../src/main/webapp/shared/services/graphQueryLanguage';
import { GraphLensValidationError } from '../../src/main/webapp/shared/utilities/splSafety';

test('parses a minimal query with only scalar fields', () => {
  const ast = parseGraphQuery('{ node(search: "alice") { id label } }');
  expect(ast.root.name).toBe('node');
  expect(ast.root.arguments).toEqual({ search: 'alice' });
  expect(ast.root.selectionSet).toEqual([
    { name: 'id', arguments: {}, selectionSet: null, pos: expect.any(Number) },
    { name: 'label', arguments: {}, selectionSet: null, pos: expect.any(Number) },
  ]);
});

test('accepts the optional leading "query" keyword', () => {
  const ast = parseGraphQuery('query { node(id: "user:jsmith") { id } }');
  expect(ast.root.arguments).toEqual({ id: 'user:jsmith' });
});

test('parses integer and bare-word (enum) argument values', () => {
  const ast = parseGraphQuery(`
    {
      node(search: "alice", limit: 5) {
        id
        logsInTo(limit: 3, direction: OUTGOING) {
          id
        }
      }
    }
  `);
  expect(ast.root.arguments.limit).toBe(5);
  const rel = ast.root.selectionSet[1];
  expect(rel.name).toBe('logsInTo');
  expect(rel.arguments.limit).toBe(3);
  expect(rel.arguments.direction).toEqual({ enum: 'OUTGOING' });
  expect(rel.selectionSet).toEqual([{ name: 'id', arguments: {}, selectionSet: null, pos: expect.any(Number) }]);
});

test('parses nested relationship selection sets recursively', () => {
  const ast = parseGraphQuery('{ node(search: "a") { id friendOf { id friendOf { id } } } }');
  const friendOf = ast.root.selectionSet[1];
  expect(friendOf.name).toBe('friendOf');
  expect(friendOf.selectionSet[1].name).toBe('friendOf');
  expect(friendOf.selectionSet[1].selectionSet).toEqual([{ name: 'id', arguments: {}, selectionSet: null, pos: expect.any(Number) }]);
});

test('skips "#" line comments', () => {
  const ast = parseGraphQuery('{\n  # a comment\n  node(search: "a") { id }\n}');
  expect(ast.root.arguments).toEqual({ search: 'a' });
});

test('rejects empty query text', () => {
  expect(() => parseGraphQuery('')).toThrow(GraphLensValidationError);
  expect(() => parseGraphQuery('   ')).toThrow(GraphLensValidationError);
});

test('rejects query text over the maximum length', () => {
  const huge = `{ node(search: "${'a'.repeat(MAX_QUERY_LENGTH)}") { id } }`;
  expect(() => parseGraphQuery(huge)).toThrow(GraphLensValidationError);
});

test('rejects a root field not named "node"', () => {
  expect(() => parseGraphQuery('{ edge(id: "x") { id } }')).toThrow(/must be named "node"/);
});

test('rejects more than one top-level field', () => {
  expect(() => parseGraphQuery('{ node(search: "a") { id } node(search: "b") { id } }')).toThrow(GraphLensValidationError);
});

test('rejects a root field with no selection set', () => {
  expect(() => parseGraphQuery('{ node(search: "a") }')).toThrow(/selection set/);
});

test('rejects an empty selection set', () => {
  expect(() => parseGraphQuery('{ node(search: "a") { } }')).toThrow(GraphLensValidationError);
});

test('rejects unterminated string literals', () => {
  expect(() => parseGraphQuery('{ node(search: "a) { id } }')).toThrow(GraphLensValidationError);
});

test('rejects malformed punctuation', () => {
  expect(() => parseGraphQuery('{ node(search: "a" { id } }')).toThrow(GraphLensValidationError);
  expect(() => parseGraphQuery('{ node(search: "a") id } }')).toThrow(GraphLensValidationError);
});

test('rejects unexpected trailing content', () => {
  expect(() => parseGraphQuery('{ node(search: "a") { id } } garbage')).toThrow(GraphLensValidationError);
});

test('rejects an unexpected character', () => {
  expect(() => parseGraphQuery('{ node(search: "a") { id; } }')).toThrow(GraphLensValidationError);
});

test('rejects nesting beyond the parser depth ceiling', () => {
  let query = 'id';
  for (let i = 0; i < 20; i += 1) {
    query = `rel { ${query} }`;
  }
  expect(() => parseGraphQuery(`{ node(search: "a") { ${query} } }`)).toThrow(/maximum supported depth/);
});
