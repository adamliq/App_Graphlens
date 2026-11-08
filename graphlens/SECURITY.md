# Security

GraphLens is designed secure-by-default: Splunk remains the sole
authentication, authorisation, search-execution, and data-storage
boundary. GraphLens adds no external credential store and no external
network dependency - every backend interaction goes through Splunk's own,
already-audited REST APIs (`services/search/jobs`,
`services/storage/collections/data/*`, `services/properties/*`,
`services/authentication/current-context`). The one piece of server-side
code GraphLens ships is the optional, disabled-by-default RBAC model
collector (`bin/graphlens_rbac_collector.py`) - see "RBAC model collector"
below, which is also the app's only component that runs with elevated
(system-user) privilege rather than the requesting user's own session.

## Reporting a vulnerability

Email `<SECURITY_CONTACT_EMAIL>` (replace this placeholder before
Splunkbase submission) with a description, reproduction steps, and impact
assessment. Please do not open a public issue for undisclosed
vulnerabilities. We aim to acknowledge reports within 5 business days.

## Input validation and SPL injection prevention

All user-controlled values pass through
`src/main/webapp/shared/utilities/splSafety.js` before they are ever used
in a search:

- **Node/edge identifiers** must match `ID_PATTERN`
  (`^[A-Za-z0-9][A-Za-z0-9:_\-.@/]{0,254}$`) - no quotes, backslashes,
  pipes, wildcards, spaces or control characters are permitted. Enforced
  both client-side (`assertValidId`) and again server-side by the
  `graphlens_valid_id` macro in `default/macros.conf`.
- **Type tokens** (node type, relationship type, layout name, export
  format) are checked against `TYPE_TOKEN_PATTERN` and/or an explicit
  allowlist (`assertAllowlisted`), never accepted as free text.
- **Free-text search terms** (the entity search box) are cleaned to a
  conservative character set and then escaped for safe embedding in a
  quoted SPL string literal (`sanitizeSearchTerm` /
  `escapeSplStringLiteral`) - see `tests/security/injection.test.js` for
  the exact payload set this is tested against (quote injection, pipe
  injection, backtick/subsearch injection, newline injection, wildcard
  injection, oversized input, NUL bytes).
- **Index and sourcetype names** used unquoted in the evidence search
  (`index=$token$ sourcetype=$token$`) are validated against
  `INDEX_NAME_PATTERN` / `SOURCETYPE_PATTERN` with a safe fallback
  (`safeIndexNameOrFallback`, `safeSourcetypeOrFallback`) even though they
  originate from Splunk's own search results, not raw user input - see
  `evidenceQueryBuilder.js` for why this extra layer exists (defence
  against a compromised/malformed upstream log source, not just the UI
  user).
- **Numeric limits** (expansion size, path depth, result counts) are
  coerced and clamped with `clampInteger`, which returns a plain
  JavaScript number - never the original string - so trailing
  metacharacters in a numeric-looking input can never reach SPL.
- Time range tokens are restricted to a fixed set of presets
  (`TimeRangeSelector.jsx`) and additionally validated by
  `assertValidTimeLiteral` if ever accepted from another source. Time
  bounding itself is done exclusively through the `dispatch.earliest_time`
  / `dispatch.latest_time` REST parameters, never through a token
  substituted into the SPL text - see the comment block at the top of
  `default/savedsearches.conf`.
- Every controlled search in `default/savedsearches.conf` also applies a
  `| head <limit>` and a `dispatch.max_time`, so even a search that somehow
  matched more than intended cannot return unbounded results or run
  unbounded.

Nothing in GraphLens ever concatenates untrusted input directly into an
SPL string outside of these validated/escaped token substitutions, and no
component accepts arbitrary user-supplied SPL.

## Cross-site scripting (XSS) prevention

- React's default JSX text rendering HTML-escapes all dynamic text
  content; GraphLens does not use `dangerouslySetInnerHTML` anywhere.
- Node/edge labels and descriptions are additionally HTML-escaped at the
  data layer, in `graphTransformer.js`, the moment a search result is
  turned into graph state - before any component ever sees them. This
  means even a value that later gets serialised into an export, a
  tooltip, or a non-React string context is already safe.
- `escapeHtml` in `splSafety.js` is available for the rare case content is
  rendered outside of React's default escaping.
- CSV export cells are separately defanged against formula-injection
  payloads (`sanitizeForExportCell` - a leading `=`, `+`, `-`, `@` or tab
  is prefixed with a single quote, per OWASP CSV-injection guidance) since
  spreadsheet formula injection is a distinct risk from HTML injection.
- See `tests/security/xss.test.js` for the payload set this is tested
  against.

## Access control

GraphLens uses native Splunk capabilities, never client-side role-name
checks, as the authority (`default/authorize.conf`):

| Capability | Grants |
|---|---|
| `graphlens_run_search` | Dispatch GraphLens's controlled searches |
| `graphlens_view_evidence` | Run the evidence/supporting-event search |
| `graphlens_export_graph` | Export the currently visible graph |
| `graphlens_create_annotation` | Create annotations |
| `graphlens_manage_shared_annotation` | Edit/delete shared annotations |
| `graphlens_save_view` | Save a graph view |
| `graphlens_manage_shared_view` | Manage shared saved views |
| `graphlens_manage_config` | Edit `graphlens_settings.conf` |
| `graphlens_manage_collections` | Curate node/edge/type KV Store data |
| `graphlens_view_health` | View the Health page and audit log |

The React frontend calls
`src/main/webapp/shared/services/capabilityService.js` to hide/disable
controls a user's role does not grant - **this is a UI convenience, not
the security boundary.** The boundary is Splunk's own enforcement on each
underlying REST endpoint:

- Search dispatch is subject to normal search-time index/data permissions
  (`srchIndexesAllowed` etc.) - GraphLens cannot show a user data their
  role could not already see through `search`.
- KV Store collection access is enforced by `metadata/default.meta` ACLs,
  scoped to the `graphlens_viewer` / `graphlens_analyst` / `graphlens_admin`
  roles.
- Configuration writes to `graphlens_settings.conf` go through Splunk's
  standard `configs/conf-*` REST endpoint, gated by Splunk's built-in
  `admin_all_objects` capability by default. If you need finer-grained
  delegation than "full admin" for configuration writes, add a
  capability-scoped `restmap.conf` stanza for the `conf-graphlens_settings`
  endpoint and verify the exact syntax against the Splunk version you are
  deploying to - this is not shipped by default because the precise
  `restmap.conf` pattern for restricting a generic custom-conf endpoint
  has changed across Splunk versions and must be verified against current
  documentation for your target version before relying on it.

### Known limitation: KV Store is collection-level, not row-level

Splunk KV Store access control (`metadata/default.meta`) is per
collection, not per document. A role granted write access to
`graphlens_annotations` or `graphlens_saved_views` (i.e. `graphlens_analyst`
and `graphlens_admin`) can technically write or delete *any* document in
that collection through the raw REST API, not only records it authored.
GraphLens's own UI only ever edits a user's own records (or, for admins,
records being managed on behalf of the team) and filters what it displays
by owner/sharing - but that is an application-level convention enforced in
the browser, not a Splunk-enforced boundary. Do not treat annotation or
saved-view "ownership" as a hard security control; treat it as a
UI-organisation feature. This is called out explicitly in
`metadata/default.meta` and tested for in
`tests/security/injection.test.js`'s sibling security-boundary tests (see
TESTING.md for the manual REST-level test procedure, which requires a live
Splunk instance and is not automatable in this repository's unit tests).

## RBAC model collector

`bin/graphlens_rbac_collector.py`, wired up (disabled by default) in
`default/inputs.conf`, is a scripted input that snapshots this Splunk
instance's own access-control structure - roles, capabilities, the indexes
each role can search, role inheritance, and (where SAML or LDAP is
configured) which identity-provider groups map to which roles - and writes
it as ordinary `graphlens_relationships` events, so it can be explored in
the Relationship Explorer like any other data. See RBAC_MODEL.md for the
full data model and setup.

This is a deliberate exception to the rest of GraphLens's design, and is
called out here for that reason:

- **It is the app's only server-side code.** Everything else in GraphLens
  is static frontend assets plus Splunk-native configuration; this is a
  Python scripted input that runs on the Splunk server itself.
- **It runs with elevated privilege, not the requesting user's session.**
  It authenticates via `passAuth = splunk-system-user`, which gives it a
  session key with full administrative read access for the duration of
  each run - not scoped to any particular GraphLens user or role. This is
  necessary because enumerating *all* roles' capabilities and index access
  (not just the running user's own role) is inherently an admin-level
  operation in Splunk; there is no lesser capability that grants it.
- **The data it produces is itself sensitive.** A full role -> capability
  -> index map, plus which SAML/LDAP groups grant which roles, is
  effectively a blueprint of this instance's privilege structure and
  identity-provider group naming (which can itself leak organisational
  structure, e.g. `cn=domain-admins,ou=...`). Treat read access to wherever
  this data lands the same way you would treat read access to
  `authorize.conf`/`authentication.conf` themselves.
- **It is disabled by default** (`disabled = true` in `default/inputs.conf`)
  and writes to `graphlens_relationships` only if an administrator enables
  it and chooses to leave that setting as-is. Before enabling it, decide
  whether the analysts who already have `srchIndexesAllowed` access to
  `graphlens_relationships` should also see this data; if not, point
  `index =` at a separate index with its own, more restrictive
  `srchIndexesAllowed` scoping on the relevant roles - GraphLens has no
  in-app mechanism to filter index data below Splunk's own index-level
  access control, so index placement is the actual security boundary here,
  the same as for every other index GraphLens reads from.
- **It never stores credentials.** The session key is read once per
  invocation from stdin (supplied by splunkd itself, per Splunk's own
  `passAuth` mechanism) and is never written to disk, logged, or reused
  across runs.
- The SAML/LDAP group-to-role mapping this script relies on
  (`roleMap_<strategy>` stanzas in `authentication.conf`) is documented
  Splunk behaviour but was not checked against a live SAML/LDAP-configured
  instance before release - see RBAC_MODEL.md and KNOWN_LIMITATIONS.md.
  Verify it reports your actual group mappings correctly before relying on
  it, the same way every other previously-unverified Splunk-internals
  assumption in this app needed live verification before being trusted
  (see DEVELOPMENT.md).

## Secrets

GraphLens requires no external credentials by design - it only ever talks
to the Splunk instance it is installed in, using the current user's own
session. Consequently:

- No secrets, tokens, or passwords are stored in source code, in KV Store,
  or in any `.conf` file shipped by GraphLens.
- No secrets are ever returned to the browser beyond what Splunk's own
  session/CSRF cookies already provide (handled entirely by Splunk Web,
  not by GraphLens code).
- If a future integration ever required a credential, it must use
  Splunk's supported credential-storage mechanism (a `passwords.conf`
  entry accessed only from trusted server-side code) - GraphLens's current
  design has no server-side code at all, so this does not apply to 1.0.0.

## Content Security Policy

GraphLens is compatible with Splunk Cloud's CSP defaults:

- No inline `<script>` blocks, no `eval`, no `new Function`, no
  dynamically constructed `<script src>` pointing anywhere other than the
  app's own bundled, same-origin static assets.
- No remote stylesheets, remote scripts, or remote fonts - Cytoscape.js,
  React and @splunk/react-ui are all bundled into
  `appserver/static/build/` by the production webpack build; nothing is
  loaded from a CDN at runtime.
- No iframes.
- All network calls target the Splunk instance's own `splunkd` REST API
  through the same-origin path Splunk Web itself uses
  (`utilities/restClient.js`), never a cross-origin endpoint.

## Audit logging

Every tracked user action (search dispatch, expansion, collapse, evidence
view, export, annotation/view CRUD, configuration change, graph-limit
event, client error) is recorded in the `graphlens_audit_log` KV Store
collection by `services/auditService.js`, with the actor, action, target
identifiers and outcome only - never credentials, tokens, or raw event
content. See ARCHITECTURE.md and ADMIN_GUIDE.md for how to review it.

## Third-party dependency security

See THIRDPARTY.md for the full inventory, licences, and the most recent
`npm audit` result. Dependency updates should re-run `npm audit` and this
document's "Vulnerability status" section as part of every release (see
DEVELOPMENT.md).
