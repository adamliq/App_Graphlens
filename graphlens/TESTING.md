# Testing

## Running the suite

```
npm test              # all suites (unit + security + performance)
npm run test:watch    # watch mode
```

As of this release: **10 suites, 239 tests, all passing**, 0 known
dependency vulnerabilities (`npm audit`).

## Unit tests (`tests/unit/`)

| File | Covers |
|---|---|
| `splSafety.test.js` | Identifier/type-token/allowlist validation, integer clamping, SPL string escaping, search-term sanitisation, HTML escaping, CSV export sanitisation, time-literal validation, index/sourcetype safe-fallback, unicode/encoded-payload edge cases |
| `graphTransformer.test.js` | Node/edge creation from rows, deduplication (nodes and edges, including nodes discovered via multiple edge rows), malformed-row rejection, label HTML-escaping, risk-score clamping, node/edge limit enforcement |
| `graphStateReducer.test.js` | Expansion (parent/child linking, already-expanded no-op, node-limit enforcement), collapse reference-counting (shared-node survival, pin/selection retention, cascading removal), hide/unhide, risk/event-count filtering |
| `pathFinder.test.js` | Shortest-path BFS over the visible graph: multi-hop, shortcut preference, no-path case, missing-endpoint case, `maxDepth` enforcement, self-path, undirected traversal |
| `exportService.test.js` | JSON export metadata/content, CSV formula-injection defanging, CSV quoting, unsupported-format rejection |
| `evidenceQueryBuilder.test.js` | Token construction for node/edge evidence queries, per-type key-field heuristic, unsafe-index/sourcetype fallback, malicious-reference rejection |
| `searchService.test.js` | Dispatch -> poll -> results flow (mocked `fetch`), search-failure error propagation, permission-error normalisation, cancellation |

## Security tests (`tests/security/`)

`injection.test.js` and `xss.test.js` run a shared payload set - quote
injection, pipe injection, backtick/subsearch injection, newline
injection, wildcards, oversized input (10,000 chars), NUL bytes, and a
standard XSS payload set (`<script>`, `<img onerror>`, `<svg onload>`,
`javascript:` URIs, template-injection-looking strings, iframe injection)
- against every function that turns untrusted input into a search token,
graph element, or exported value. See SECURITY.md for the corresponding
narrative description of each control.

### Spinning up a local Splunk instance

`scripts/run_splunk_podman.sh` runs a disposable Splunk Enterprise
container via [podman](https://podman.io/) for exactly this purpose: it
starts the container, creates the `graphlens_relationships` index, loads
`sample_data/*.csv`, packages and installs the app, and provisions
`test_graphlens_viewer` / `test_graphlens_analyst` / `test_graphlens_admin`
users against the three roles in `authorize.conf`.

```
scripts/run_splunk_podman.sh all      # start + index + sample data + app + test users
scripts/run_splunk_podman.sh status   # container + splunkd health
scripts/run_splunk_podman.sh logs     # tail splunkd.log
scripts/run_splunk_podman.sh clean    # tear everything down
```

Run `scripts/run_splunk_podman.sh` with no arguments for the full command
list. Requires `podman`, `npm`, and `curl` on the machine you run it from,
and outbound access to Docker Hub to pull `splunk/splunk`.

Two categories in the design brief require a **live Splunk instance** and
are not automatable as Jest unit tests in this repository:

- **Privilege-boundary tests** (a `graphlens_viewer` cannot write KV
  Store, cannot access `graphlens_manage_config`-gated actions, etc.) -
  covered structurally by `metadata/default.meta` + `authorize.conf`
  reasoning in SECURITY.md; verify with real role assignments before
  release: create a test user in each of the three example roles, confirm
  the Configuration/Health pages behave as documented, and confirm a
  direct REST call to a KV Store collection is rejected for a role that
  lacks write access to it.
- **Unauthorised saved-search access** - confirm a user without
  `graphlens_run_search` cannot dispatch GraphLens's saved searches, using
  Splunk's own role-based access control (this is inherent to Splunk, not
  something GraphLens adds, but should still be smoke-tested once per
  release against a live instance).

## Performance tests (`tests/performance/`)

`graphScale.test.js` exercises the transform -> merge -> collapse ->
render-selection pipeline at 100/250, 500/1000, and 1000/2500
node/edge scale, asserting configured limits are respected and the
purely client-side pipeline completes well under a second even at the
largest scale, plus a 100-cycle repeated expand/collapse stress test that
checks for state leaks. This is a **smoke test for pathological
algorithmic complexity**, not a substitute for testing against a real
Splunk deployment under load. Before a production release, additionally
test manually (or via a scripted browser test) against a live Splunk
instance with:

- 100 nodes / 250 edges
- 500 nodes / 1000 edges
- 1000 nodes / 2500 edges
- A dense relationship subset (many edges between a small node set)
- Repeated expansion and collapse of the same node
- An artificially slow Splunk search response (throttle the network in
  browser dev tools) to confirm loading states and cancellation behave
  correctly
- A cancelled search (navigate away mid-search) to confirm
  `searchService.cancel()` is actually invoked and the job is cancelled
  server-side (check `index=_audit action=search` for the cancel)

## Component/browser tests

This release ships unit-level coverage for the framework-agnostic logic
layer (`shared/services`, `shared/utilities`, `shared/hooks`) but does not
include a React Testing Library / browser component test suite for
`src/main/webapp/pages/**/components/*.jsx` - the components are
deliberately thin presentational wrappers around that logic layer (see
ARCHITECTURE.md, "Directory layout"). Before a production release, add
component-level tests (React Testing Library + jsdom, already available
via `jest-environment-jsdom`) for at minimum: `GraphCanvas` (element
sync, layout re-run triggers), `NodeDetailsPanel`/`EdgeDetailsPanel`
(action button wiring), `ExportDialog`, `EntitySearch`, and
`PathFinderPanel`, and perform a manual smoke test of the built
application in each browser listed in README.md's supported-browser
matrix.

## Upgrade tests

Before releasing a new version: install the previous version, add a
saved view/annotation/curated node as a test user, install the new
version over it, and confirm the saved view/annotation/curated node and
any `local/graphlens_settings.conf` overrides survive the upgrade
unchanged (see CONFIGURATION.md, "Upgrade").
