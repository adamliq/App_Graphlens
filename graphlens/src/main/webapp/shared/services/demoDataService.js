/**
 * "Load demo data" (Configuration page): seeds the bundled sample node/
 * relationship type KV Store collections and the bundled sample
 * relationships, so a fresh install can be explored immediately without
 * an administrator running the manual steps in INSTALL.md/DATA_INGESTION.md
 * by hand. Every search dispatched here has zero dynamic tokens except an
 * administrator-configured index/lookup name (already validated the same
 * way every other use of that setting is - see splTemplates.js); this is
 * pure SPL dispatch, no new REST surface beyond search/jobs.
 *
 * Index mode uses `| collect` (see splTemplates.js's
 * buildSeedRelationshipsIndexSpl for why it targets a dedicated
 * `graphlens:relationship:demo` sourcetype rather than
 * `graphlens:relationship` itself - confirmed against a live instance that
 * the obvious choice does not work). Lookup mode instead replaces the
 * configured relationship lookup's contents outright via `| outputlookup` -
 * the same destructive-by-design behaviour that command always has, same
 * as the manual INSTALL.md instructions already carry.
 */
import { dispatchAdHocSearch } from './searchService';
import { safeIndexNameOrFallback, safeLookupNameOrFallback } from '../utilities/splSafety';
import {
  buildSeedNodeTypesSpl,
  buildSeedRelationshipTypesSpl,
  buildSeedRelationshipsLookupSpl,
  buildSeedRelationshipsIndexSpl,
} from './splTemplates';

const DEFAULT_INDEX = 'graphlens_relationships';
const DEFAULT_LOOKUP = 'graphlens_relationships_lookup';

async function runOneshot(spl, { fetchImpl, maxResultRows = 1 } = {}) {
  const job = dispatchAdHocSearch(spl, { maxResultRows, fetchImpl });
  return job.waitForResults({ count: maxResultRows });
}

/**
 * @param {{type: 'index'|'lookup', index?: string, lookupName?: string}} source
 *   - the same shape splTemplates.js's relationship-reading functions take
 *   (see configService.js's relationshipSourceFromSettings).
 */
export async function loadDemoData({ source, fetchImpl } = {}) {
  const isLookup = source && source.type === 'lookup';
  const targetIndex = safeIndexNameOrFallback(source && source.index, DEFAULT_INDEX);
  const targetLookup = safeLookupNameOrFallback(source && source.lookupName, DEFAULT_LOOKUP);

  const [, , relationshipsResult] = await Promise.all([
    runOneshot(buildSeedNodeTypesSpl(), { fetchImpl }),
    runOneshot(buildSeedRelationshipTypesSpl(), { fetchImpl }),
    isLookup
      ? runOneshot(buildSeedRelationshipsLookupSpl(targetLookup), { fetchImpl, maxResultRows: 1000 })
      : runOneshot(buildSeedRelationshipsIndexSpl(targetIndex), { fetchImpl }),
  ]);

  const relationshipCount = isLookup
    ? relationshipsResult.rows.length
    : Number(relationshipsResult.rows[0] && relationshipsResult.rows[0].count) || 0;

  return { mode: isLookup ? 'lookup' : 'index', relationshipCount };
}
