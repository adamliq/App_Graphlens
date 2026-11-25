import {
  buildInitialEntitySearchSpl,
  buildExpandNodeSpl,
  buildNodeDetailsSpl,
  buildEdgeDetailsSpl,
  buildEvidenceSpl,
  buildClusterExpandSpl,
  buildSeedNodeTypesSpl,
  buildSeedRelationshipTypesSpl,
  buildSeedRelationshipsLookupSpl,
  buildSeedRelationshipsIndexSpl,
} from '../../src/main/webapp/shared/services/splTemplates';
import { GraphLensValidationError } from '../../src/main/webapp/shared/utilities/splSafety';

describe('splTemplates - every search starts with the literal "search" keyword', () => {
  // Splunk's /services/search/jobs ad-hoc dispatch rejects a bare
  // macro/filter expression with no leading generating command
  // ("Unknown search command 'index'") - confirmed against a live Splunk
  // instance. Every template must start with "search ".
  test.each([
    ['initial entity search', buildInitialEntitySearchSpl('jsmith', 20)],
    ['expand node', buildExpandNodeSpl('user:jsmith', 100)],
    ['node details', buildNodeDetailsSpl('user:jsmith')],
    ['edge details', buildEdgeDetailsSpl('edge:abc123')],
    ['evidence', buildEvidenceSpl({
      safe_evidence_index: 'graphlens_relationships',
      safe_evidence_sourcetype: 'graphlens:relationship',
      safe_evidence_key_field: 'evidence_reference',
      safe_evidence_key_value: '"edge:abc123"',
    }, 100)],
    ['cluster expand', buildClusterExpandSpl('node_type', 'user', 100)],
  ])('%s starts with "search "', (_name, spl) => {
    expect(spl.startsWith('search ')).toBe(true);
  });
});

describe('splTemplates - lookup-mode source generates | inputlookup instead of search index', () => {
  // Lookup mode is an alternative generating clause, not a filter
  // variation - these pin that each relationship-reading template honours
  // the `source` argument instead of silently falling back to index mode,
  // and that `inputlookup` (not `search`) leads. Confirmed against a live
  // Splunk instance that `| inputlookup <name>` dispatches as a valid sole
  // generating command the same way `search index=...` does (see
  // ARCHITECTURE.md, CHANGELOG.md 1.2.0).
  const lookupSource = { type: 'lookup', lookupName: 'graphlens_relationships_lookup' };

  test('buildInitialEntitySearchSpl leads with inputlookup, not search', () => {
    const spl = buildInitialEntitySearchSpl('jsmith', 20, lookupSource);
    expect(spl.startsWith('| inputlookup graphlens_relationships_lookup')).toBe(true);
    expect(spl).not.toMatch(/^search /);
    expect(spl).toContain('append [ | inputlookup graphlens_relationships_lookup');
  });

  test('buildExpandNodeSpl leads with inputlookup and filters via a separate | search stage', () => {
    const spl = buildExpandNodeSpl('user:jsmith', 50, lookupSource);
    expect(spl.startsWith('| inputlookup graphlens_relationships_lookup')).toBe(true);
    expect(spl).toContain('| search (source_id="user:jsmith" OR target_id="user:jsmith")');
  });

  test('buildNodeDetailsSpl and buildEdgeDetailsSpl honour lookup mode', () => {
    expect(buildNodeDetailsSpl('user:jsmith', lookupSource).startsWith('| inputlookup graphlens_relationships_lookup')).toBe(true);
    expect(buildEdgeDetailsSpl('edge:abc123', lookupSource).startsWith('| inputlookup graphlens_relationships_lookup')).toBe(true);
  });

  test('buildClusterExpandSpl honours lookup mode', () => {
    const spl = buildClusterExpandSpl('node_type', 'user', 100, lookupSource);
    expect(spl.startsWith('| inputlookup graphlens_relationships_lookup')).toBe(true);
  });

  test('an invalid lookup name falls back to the default rather than being embedded', () => {
    const spl = buildExpandNodeSpl('user:jsmith', 50, { type: 'lookup', lookupName: '../etc/passwd' });
    expect(spl).toContain('| inputlookup graphlens_relationships_lookup');
    expect(spl).not.toContain('../etc/passwd');
  });

  test('omitting source defaults to index mode (backward compatible)', () => {
    const spl = buildExpandNodeSpl('user:jsmith', 50);
    expect(spl.startsWith('search index="graphlens_relationships"')).toBe(true);
  });

  test('buildEvidenceSpl never takes a source argument and always reads an index', () => {
    const spl = buildEvidenceSpl({
      safe_evidence_index: 'graphlens_relationships',
      safe_evidence_sourcetype: 'graphlens:relationship',
      safe_evidence_key_field: 'evidence_reference',
      safe_evidence_key_value: '"edge:abc123"',
    }, 100);
    expect(spl.startsWith('search index=')).toBe(true);
  });
});

describe('splTemplates - saved-search-mode source generates | savedsearch instead of search index', () => {
  // Third alternative generating clause alongside index/lookup (see
  // ARCHITECTURE.md's "How searches retrieve relationships" and
  // SECURITY.md's "Saved search as a relationship data source").
  const savedSearchSource = { type: 'saved_search', savedSearchName: 'GraphLens Relationships' };

  test('buildInitialEntitySearchSpl leads with savedsearch, not search', () => {
    const spl = buildInitialEntitySearchSpl('jsmith', 20, savedSearchSource);
    expect(spl.startsWith('| savedsearch "GraphLens Relationships"')).toBe(true);
    expect(spl).not.toMatch(/^search /);
    expect(spl).toContain('append [ | savedsearch "GraphLens Relationships"');
  });

  test('buildExpandNodeSpl leads with savedsearch and filters via a separate | search stage', () => {
    const spl = buildExpandNodeSpl('user:jsmith', 50, savedSearchSource);
    expect(spl.startsWith('| savedsearch "GraphLens Relationships"')).toBe(true);
    expect(spl).toContain('| search (source_id="user:jsmith" OR target_id="user:jsmith")');
  });

  test('buildNodeDetailsSpl and buildEdgeDetailsSpl honour saved-search mode', () => {
    expect(buildNodeDetailsSpl('user:jsmith', savedSearchSource).startsWith('| savedsearch "GraphLens Relationships"')).toBe(true);
    expect(buildEdgeDetailsSpl('edge:abc123', savedSearchSource).startsWith('| savedsearch "GraphLens Relationships"')).toBe(true);
  });

  test('buildClusterExpandSpl honours saved-search mode', () => {
    const spl = buildClusterExpandSpl('node_type', 'user', 100, savedSearchSource);
    expect(spl.startsWith('| savedsearch "GraphLens Relationships"')).toBe(true);
  });

  test('an invalid saved search name falls back to the default rather than being embedded', () => {
    const spl = buildExpandNodeSpl('user:jsmith', 50, { type: 'saved_search', savedSearchName: 'x" | delete | eval y="' });
    expect(spl).toContain('| savedsearch "graphlens_relationships_saved_search"');
    expect(spl).not.toContain('delete');
  });
});

describe('splTemplates - dataset-mode source generates | from datamodel: instead of search index', () => {
  // Fourth alternative generating clause alongside index/lookup/saved
  // search (see ARCHITECTURE.md's "How searches retrieve relationships"
  // and SECURITY.md's "Saved search as a relationship data source", which
  // also covers Table Dataset mode). `| from datamodel:"<name>"` was
  // chosen over `| datamodel "<name>" search` specifically because the
  // latter's output fields come back prefixed with the model's object
  // name (confirmed against a live instance) - these tests pin the
  // chosen command, not the rejected one.
  const datasetSource = { type: 'dataset', datasetName: 'graphlens_relationships_dataset' };

  test('buildInitialEntitySearchSpl leads with from datamodel, not search', () => {
    const spl = buildInitialEntitySearchSpl('jsmith', 20, datasetSource);
    expect(spl.startsWith('| from datamodel:"graphlens_relationships_dataset"')).toBe(true);
    expect(spl).not.toMatch(/^search /);
    expect(spl).toContain('append [ | from datamodel:"graphlens_relationships_dataset"');
  });

  test('buildExpandNodeSpl leads with from datamodel and filters via a separate | search stage', () => {
    const spl = buildExpandNodeSpl('user:jsmith', 50, datasetSource);
    expect(spl.startsWith('| from datamodel:"graphlens_relationships_dataset"')).toBe(true);
    expect(spl).toContain('| search (source_id="user:jsmith" OR target_id="user:jsmith")');
  });

  test('buildNodeDetailsSpl and buildEdgeDetailsSpl honour dataset mode', () => {
    expect(buildNodeDetailsSpl('user:jsmith', datasetSource).startsWith('| from datamodel:"graphlens_relationships_dataset"')).toBe(true);
    expect(buildEdgeDetailsSpl('edge:abc123', datasetSource).startsWith('| from datamodel:"graphlens_relationships_dataset"')).toBe(true);
  });

  test('buildClusterExpandSpl honours dataset mode', () => {
    const spl = buildClusterExpandSpl('node_type', 'user', 100, datasetSource);
    expect(spl.startsWith('| from datamodel:"graphlens_relationships_dataset"')).toBe(true);
  });

  test('an invalid dataset name falls back to the default rather than being embedded', () => {
    const spl = buildExpandNodeSpl('user:jsmith', 50, { type: 'dataset', datasetName: 'x" | delete | eval y="' });
    expect(spl).toContain('| from datamodel:"graphlens_relationships_dataset"');
    expect(spl).not.toContain('delete');
  });

  test('a dataset name with spaces falls back to the default rather than being embedded (machine names never have spaces)', () => {
    const spl = buildExpandNodeSpl('user:jsmith', 50, { type: 'dataset', datasetName: 'My Table Dataset' });
    expect(spl).toContain('| from datamodel:"graphlens_relationships_dataset"');
    expect(spl).not.toContain('My Table Dataset');
  });
});

describe('splTemplates - identifier validation', () => {
  test('buildExpandNodeSpl rejects an invalid node id', () => {
    expect(() => buildExpandNodeSpl('user: jsmith" | delete', 100)).toThrow(GraphLensValidationError);
  });

  test('buildNodeDetailsSpl rejects an invalid node id', () => {
    expect(() => buildNodeDetailsSpl('../../etc/passwd')).toThrow(GraphLensValidationError);
  });

  test('buildEdgeDetailsSpl rejects an invalid edge id', () => {
    expect(() => buildEdgeDetailsSpl('edge:1`external_cmd`')).toThrow(GraphLensValidationError);
  });

  test('buildExpandNodeSpl embeds a server-side graphlens_id_pattern guard for the exact node id', () => {
    const spl = buildExpandNodeSpl('user:jsmith', 50);
    expect(spl).toContain('| where match("user:jsmith", `graphlens_id_pattern`)');
  });
});

describe('splTemplates - edge_id is derived when missing, before grouping by it', () => {
  // edge_id is optional (DATA_MODEL.md, DATA_INGESTION.md), documented as
  // derived deterministically when a data source omits it - confirmed
  // against a live instance (both index and lookup mode) that this
  // derivation did not actually exist before this fix, and that `stats
  // ... by edge_id ...` silently drops every row missing the field
  // entirely (not merely empty), the same class of bug previously fixed
  // for evidence_reference. See CHANGELOG.md.
  test.each([
    ['buildExpandNodeSpl', () => buildExpandNodeSpl('user:jsmith', 50), /stats .*by.*edge_id/],
    ['buildEdgeDetailsSpl', () => buildEdgeDetailsSpl('edge:abc123'), /stats .*by.*edge_id/],
    ['buildNodeDetailsSpl', () => buildNodeDetailsSpl('user:jsmith'), /stats .*dc\(edge_id\)/],
    ['buildClusterExpandSpl', () => buildClusterExpandSpl('node_type', 'user', 100), /stats .*by.*edge_id/],
  ])('%s derives edge_id before any stats that reads it', (_name, build, statsPattern) => {
    const spl = build();
    const deriveIndex = spl.indexOf('eval edge_id=if(isnull(edge_id)');
    const statsIndex = spl.search(statsPattern);
    expect(deriveIndex).toBeGreaterThan(-1);
    expect(statsIndex).toBeGreaterThan(-1);
    expect(deriveIndex).toBeLessThan(statsIndex);
  });

  test('buildEdgeDetailsSpl filters on edge_id only after deriving it, not at the generating stage', () => {
    const spl = buildEdgeDetailsSpl('edge:abc123');
    const deriveIndex = spl.indexOf('eval edge_id=if(isnull(edge_id)');
    const filterIndex = spl.indexOf('search edge_id="edge:abc123"');
    expect(spl.startsWith('search index="graphlens_relationships"\n')).toBe(true);
    expect(deriveIndex).toBeGreaterThan(-1);
    expect(filterIndex).toBeGreaterThan(deriveIndex);
  });
});

describe('splTemplates - evidence_reference is fillnull-ed before grouping by it', () => {
  // evidence_reference is optional (DATA_MODEL.md). A data source that
  // never sets it (e.g. the RBAC model collector, see CHANGELOG.md) omits
  // it entirely from indexed events, not just leaves it empty -
  // INDEXED_EXTRACTIONS=csv creates no field at all for an empty CSV
  // cell. `stats ... by` grouping on a field absent from every matching
  // event returns zero result rows, confirmed against a live instance -
  // this silently broke expand/edge-details for any evidence-less node
  // until a `fillnull` was added ahead of the stats in both templates.
  // These tests pin that the fillnull stays present and stays ordered
  // before the stats that groups by evidence_reference.
  test.each([
    ['buildExpandNodeSpl', buildExpandNodeSpl('user:jsmith', 50)],
    ['buildEdgeDetailsSpl', buildEdgeDetailsSpl('edge:abc123')],
  ])('%s fillnulls evidence_reference before the stats that groups by it', (_name, spl) => {
    const fillnullIndex = spl.indexOf('fillnull value="" evidence_reference');
    const statsIndex = spl.indexOf('stats sum(event_count)');
    expect(fillnullIndex).toBeGreaterThan(-1);
    expect(statsIndex).toBeGreaterThan(-1);
    expect(fillnullIndex).toBeLessThan(statsIndex);
  });
});

describe('splTemplates - limits are always bare, validated numbers', () => {
  test('buildExpandNodeSpl clamps an out-of-range limit', () => {
    const spl = buildExpandNodeSpl('user:jsmith', 999999);
    expect(spl).toContain('| head 5000'); // clamped to max
    expect(spl).not.toContain('999999');
  });

  test('buildInitialEntitySearchSpl falls back for a garbage limit rather than embedding it', () => {
    const spl = buildInitialEntitySearchSpl('jsmith', 'not-a-number; | delete');
    expect(spl).toContain('| head 20');
    expect(spl).not.toMatch(/delete/);
  });
});

describe('splTemplates - evidence search interpolates only pre-validated tokens', () => {
  test('builds the expected index/sourcetype/key clause', () => {
    const spl = buildEvidenceSpl({
      safe_evidence_index: 'graphlens_relationships',
      safe_evidence_sourcetype: 'graphlens:relationship',
      safe_evidence_key_field: 'src_user',
      safe_evidence_key_value: '"jsmith"',
    }, 50);
    expect(spl).toContain('index=graphlens_relationships sourcetype=graphlens:relationship src_user="jsmith"');
    expect(spl).toContain('| head 50');
  });
});

describe('splTemplates - demo data (Configuration page "Load demo data")', () => {
  test('buildSeedNodeTypesSpl and buildSeedRelationshipTypesSpl have zero dynamic tokens', () => {
    expect(buildSeedNodeTypesSpl()).toBe('| inputlookup graphlens_sample_node_types | outputlookup graphlens_node_types');
    expect(buildSeedRelationshipTypesSpl()).toBe('| inputlookup graphlens_sample_relationship_types | outputlookup graphlens_relationship_types');
  });

  test('buildSeedRelationshipsLookupSpl interpolates a validated lookup name', () => {
    expect(buildSeedRelationshipsLookupSpl('my_custom_lookup'))
      .toBe('| inputlookup graphlens_sample_relationships | outputlookup my_custom_lookup');
  });

  test('buildSeedRelationshipsLookupSpl falls back to the default rather than embedding an invalid name', () => {
    const spl = buildSeedRelationshipsLookupSpl('../etc/passwd');
    expect(spl).toContain('| outputlookup graphlens_relationships_lookup');
    expect(spl).not.toContain('../etc/passwd');
  });

  test('buildSeedRelationshipsIndexSpl interpolates a validated index name into both eval and collect', () => {
    const spl = buildSeedRelationshipsIndexSpl('my_custom_index');
    expect(spl).toContain('| inputlookup graphlens_sample_relationships');
    expect(spl).toContain('source_index="my_custom_index"');
    expect(spl).toContain('| collect index=my_custom_index sourcetype=graphlens:relationship:demo testmode=false');
    expect(spl).toContain('source_sourcetype="graphlens:relationship:demo"');
  });

  test('buildSeedRelationshipsIndexSpl falls back to the default rather than embedding an invalid index name', () => {
    const spl = buildSeedRelationshipsIndexSpl('../etc/passwd');
    expect(spl).toContain('index=graphlens_relationships');
    expect(spl).not.toContain('../etc/passwd');
  });
});
