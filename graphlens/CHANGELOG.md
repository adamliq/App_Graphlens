# Changelog

All notable changes to GraphLens are documented in this file.

## [1.0.1] - 2026-11-08

Fixes found and verified by installing the built package into a real
Splunk Enterprise 10.6.1 (build 1) Docker container and exercising it end to end
(search, expand, evidence, Configuration, Health) - not just unit tests.
See DEVELOPMENT.md for the full verification notes.

### Fixed

- **HTTP 500 opening the app.** The Relationship Explorer, Health and
  Configuration view templates used `${make_url(...)}` to build their
  CSS/JS asset URLs, assuming Splunk's Mako rendering environment provides
  `make_url` as a bare template global. It does not, and the resulting
  `NameError` caused every view to fail to render. The templates now use a
  hardcoded absolute static path (`/static/app/graphlens/...`) instead,
  which requires no Mako-provided helper at all. See DEVELOPMENT.md item 1.
- **Every search, KV Store write and configuration save failed with "CSRF
  validation failed".** Splunk Web's CSRF check
  (`splunk.appserver.mrsparkle.lib.util.is_xhr`) only reads the CSRF token
  from the `X-Splunk-Form-Key` header when the request also carries
  `X-Requested-With: XMLHttpRequest`; without it, Splunk falls back to
  expecting the token as a `splunk_form_key` POST body parameter instead,
  which GraphLens never sent. Fixed by adding that header to every request
  in `utilities/restClient.js`'s shared `splunkFetch`.
- **Every parameterised search failed** (`| head $safe_result_limit$` and
  similar errored with "The argument must be a positive number or a
  boolean expression."). The saved searches in `default/savedsearches.conf`
  relied on `args.<token>` substitution into `$token$` placeholders on
  `/dispatch` - confirmed against a live instance, Splunk accepts those
  args but never substitutes them into the saved search's own SPL text;
  the dispatched job still contains the literal `$token$` string.
  Replaced with ad-hoc dispatch (`services/search/jobs`) of a complete SPL
  string built from a fixed template in the new
  `shared/services/splTemplates.js`, using the same validated/escaped
  values as before. `default/savedsearches.conf` now only contains the two
  searches with no dynamic token (`graphlens_graph_statistics`,
  `graphlens_health`).
- **The server-side identifier validation guard failed to parse**
  ("Error in 'where'/'EvalCommand' command: The expression is malformed.
  Expected )."). Two designs were tried and found broken on a live
  instance: an `iseval=1` macro (rejected by the search parser outright),
  and a plain-substitution macro taking the identifier as a macro *call
  argument* (Splunk's macro-argument parser does not respect quoting when
  the argument contains a colon, which every GraphLens identifier has,
  e.g. `user:jsmith`). Fixed by making `graphlens_id_pattern` a
  no-argument macro holding only the regex, applied as
  `` match("<id>", `graphlens_id_pattern`) `` so the identifier is never
  passed as a macro argument. See `default/macros.conf`.
- **Entity search failed to match on a node's identifier value.** The
  search term was only prefix-matched against `node_id` (e.g. searching
  "jsmith" would not match `user:jsmith`, which starts with "user:"), so a
  user had to already know the exact `type:` prefix or the precise label
  text. Changed to a substring match on both `node_id` and `node_label`.

### Changed

- Bumped to 1.0.1 (`app.manifest`, `app.conf`, `package.json` kept in
  sync).
- Resolved a newly-disclosed transitive `fast-uri` advisory via
  `npm audit fix` (back to 0 known vulnerabilities).

### Verified but not a defect

- KV Store collection reads (`graphlens_node_types`,
  `graphlens_relationship_types`, `graphlens_audit_log`) returned
  transient HTTP 503s for a few seconds immediately after a fresh
  container start, before resolving on their own. The app degraded
  gracefully (empty state, no crash) rather than erroring, which is the
  intended behaviour - see `typeConfigService.js`'s try/catch-and-fall-back
  pattern.

## [1.0.0] - 2026-07-17

Initial release.

### Added

- Interactive, Cytoscape.js-based relationship graph explorer (Relationship
  Explorer page): entity search, lazy one-hop expansion, reference-counted
  collapse, node/edge selection, pin/unpin, hide, node-type and
  relationship-type filters, risk-score and minimum-event-count filters,
  time-range selector, five built-in Cytoscape layouts, fit/centre/reset,
  client-side shortest-path finder over the visible graph, JSON/CSV/PNG
  export, graph-size limit banner, empty and error states.
- Supporting-event drilldown for both nodes and edges through a bounded,
  pre-approved search template.
- Administrator Configuration page for graph limits, search defaults and
  feature toggles, backed by `graphlens_settings.conf`.
- Health page summarising recent audited actions from the
  `graphlens_audit_log` KV Store collection.
- KV Store collections for curated node/edge metadata, node/relationship
  type display configuration, saved graph views, annotations and the audit
  log.
- Example roles and capabilities (`graphlens_viewer`, `graphlens_analyst`,
  `graphlens_admin`) in `authorize.conf`.
- Synthetic sample data covering security investigation, Splunk
  knowledge-object lineage, logging catalogue, application dependency and
  identity relationship use cases.
- Full documentation set (see README.md for the index).

### Known limitations

See KNOWN_LIMITATIONS.md.
