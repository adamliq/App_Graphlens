# Changelog

All notable changes to GraphLens are documented in this file.

## [1.1.3] - 2026-11-20

Found by checking what a user actually sees above GraphLens's own
content: there is no Splunk Web chrome (no app switcher, no header, no
nav) around any of the three pages, and - because GraphLens had no
navigation of its own either - no way to move between Relationship
Explorer, Health and Configuration at all once you had landed on one of
them, other than editing the URL by hand. This has been true since 1.0.0.

### Root cause (not a regression, a platform characteristic)

Confirmed by reading Splunk's own
`appserver/mrsparkle/controllers/view.py` on a live Splunk Enterprise
10.6.1 (build 1) instance: a `type="html"` custom view (what all three of
GraphLens's views are, in `default/data/ui/views/*.xml`) is
*unconditionally* served through `bypass_module_system()`'s fast path,
which never renders Splunk's own app-switcher/nav chrome around the page
- regardless of what the view's own Mako template inherits from. Changing
the templates to inherit from `//layout/view.html` instead of
`//layout/base.html` would not fix this; it would break rendering outright,
since that template requires `VIEW`/`APP`/`modules` context the fast path
never supplies. There is no way to get Splunk's own chrome for a
`type="html"` view; see KNOWN_LIMITATIONS.md.

### Added

- GraphLens now provides its own in-app navigation
  (`shared/components/PageNav.jsx`, a `@splunk/react-ui` `TabBar`) at the
  top of all three pages, linking to the other two. `getAppViewUrl()`
  (`shared/utilities/restClient.js`) builds each link from `window.$C`
  (Splunk's own injected runtime config), the same pattern already used
  for `getSplunkdPath()`.

## [1.1.2] - 2026-11-16

Found by actually opening the Relationship Explorer against the live
1.1.1 RBAC data (not just confirming it existed in the index, as 1.1.1's
own verification did) - searching for a role and clicking Expand silently
did nothing. The underlying expand search was dispatching and "succeeding"
(confirmed in the audit log), but returning zero rows.

### Fixed

- **Expanding or viewing details on any node/edge with no
  `evidence_reference` returned zero results**, not just for the RBAC
  model collector's own data but for any current or future data source
  that leaves this optional field unset. Root cause: `evidence_reference`
  with an empty-string value is not merely empty in an indexed CSV event
  (`INDEXED_EXTRACTIONS = csv`) - the field does not exist on the event at
  all, because Splunk's CSV field extraction never creates a field for an
  empty cell. `stats ... by` grouping on a field that is entirely absent
  from every matching event returns zero result rows (confirmed against a
  live instance), not rows grouped under an empty value. This was latent
  in `buildExpandNodeSpl`/`buildEdgeDetailsSpl`
  (`shared/services/splTemplates.js`) since 1.0.1 - it never fired before
  because the only prior data producer (`scripts/generate_sample_data.py`)
  always populated `evidence_reference` with at least the edge's own id.
  1.1.0's RBAC model collector was the first real data source to leave it
  genuinely unset (correctly, since RBAC edges have no underlying raw
  event to drill into), which is what exposed the bug. Fixed by adding
  `| fillnull value="" evidence_reference` immediately before the `stats`
  in both templates, so the field always exists for grouping purposes
  regardless of what any data source does or doesn't set. Two regression
  tests pin the fillnull's presence and ordering.

## [1.1.1] - 2026-11-16

Fixes found by actually installing 1.1.0 into a live Splunk Enterprise
10.6.1 (build 1) Docker container and enabling the RBAC model collector
as a real scripted input - not just unit tests or a simulated stdin feed
(see DEVELOPMENT.md). Two real bugs would have made the collector
silently produce no data on every real installation; both are fixed here,
and the live check also led to a more precise, least-privilege setup
recommendation.

### Fixed

- **`passAuth = splunk-system-user` is not a real account.** 1.1.0
  shipped this as the collector's authentication mechanism, assuming it
  was a universal reserved value. It is not - Splunk's own
  `inputs.conf.spec` says `passAuth` names a real, existing user account,
  and no such account exists on a default install. The scripted input ran
  (confirmed in `_internal`) but every single invocation failed with "no
  session key on stdin." Fixed by removing the default entirely - there is
  no safe universal value - and requiring an administrator to set
  `passAuth` explicitly via `local/inputs.conf` when enabling the input
  (see RBAC_MODEL.md, "Setup").
- **Session key stdin format was wrong.** `read_session_key()` assumed
  splunkd writes `sessionKey=<key>` as a line to the script's stdin. A
  live probe of the actual bytes splunkd sends showed this is wrong too -
  it is the raw session key with no prefix and no trailing newline. Fixed
  to read stdin directly.
- **Successful runs were indistinguishable from errors in `_internal`.**
  The collector logged a "collected RBAC model: ..." summary to stderr on
  every successful run; splunkd's `ExecProcessor` tags *any* stderr output
  from a scripted input as `log_level=ERROR`, regardless of content, so
  every normal, successful daily run looked like a recurring error to
  anyone watching `index=_internal log_level=ERROR`. Fixed by only logging
  genuine failures.

### Changed

- **More precise, least-privilege `passAuth` guidance.** 1.1.0's
  documentation said the collector needs "admin-equivalent" access.
  Tested against a live instance: a dedicated account holding only
  `edit_roles` and `change_authentication` - not `admin_all_objects` - is
  sufficient for the collector to run end-to-end. RBAC_MODEL.md and
  SECURITY.md now recommend creating exactly that dedicated role/account
  instead of pointing `passAuth` at an actual administrator's own login.

## [1.1.0] - 2026-11-08

### Added

- **RBAC model collector** (`bin/graphlens_rbac_collector.py`, disabled by
  default). A new scripted input that snapshots this Splunk instance's own
  roles, capabilities, per-role index access, role inheritance, and - where
  SAML or LDAP is configured - which identity-provider groups map to which
  roles, and feeds it into the Relationship Explorer as ordinary graph
  data. New node types `saml_group`/`ldap_group` and relationship types
  `CAN_SEARCH`/`INHERITS_FROM` (the `role`/`privilege`/`index`/
  `identity_provider` node types and `GRANTS`/`HAS_ROLE`/
  `AUTHENTICATES_VIA` relationship types already existed). See
  RBAC_MODEL.md for the data model and setup, and SECURITY.md's "RBAC
  model collector" section for why this is off by default and what to
  consider before enabling it - this is the app's first and only piece of
  server-side code and its only component that runs with elevated,
  system-level privilege rather than the requesting user's own session.
  The role/capability/index REST calls this relies on were verified
  against a live Splunk Enterprise 10.6.1 (build 1) instance; the
  SAML/LDAP group-mapping path was not (no SAML/LDAP provider was
  available to test against) - see KNOWN_LIMITATIONS.md.
- `DATA_INGESTION.md`: a guide for loading your own relationship data into
  GraphLens (index schema, ingestion paths, KV Store type registration,
  evidence wiring).

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
