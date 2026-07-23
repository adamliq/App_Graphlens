# Changelog

All notable changes to GraphLens are documented in this file.

## [1.0.1] - 2026-07-18

### Fixed

- **Fixed HTTP 500 opening the app.** The Relationship Explorer, Health
  and Configuration view templates used `${make_url(...)}` to build their
  CSS/JS asset URLs, assuming Splunk's Mako rendering environment provides
  `make_url` as a bare template global. It does not, and the resulting
  `NameError` caused every view to fail to render. The templates now use a
  hardcoded absolute static path (`/static/app/graphlens/...`) instead,
  which requires no Mako-provided helper at all. See DEVELOPMENT.md item 1
  and APPINSPECT.md for the full detail, including the residual edge case
  for deployments behind a custom `MRSPARKLE_ROOT_PATH`.

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
- Supporting-event drilldown for both nodes and edges through the
  `graphlens_evidence_search` controlled search template.
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
