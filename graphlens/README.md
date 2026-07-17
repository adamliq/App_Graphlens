# GraphLens

Interactive, Neo4j-like relationship-graph exploration for data already in
Splunk.

**GraphLens is an independent, third-party Splunk application. It does not
require, embed, or connect to Neo4j or any other external graph database.**
Splunk itself is the data store, search engine, security boundary, and
application platform - GraphLens adds only browser-side rendering/state
and a small set of bounded, pre-approved searches.

- **Author / vendor**: Adam Liquorish
- **Version**: 1.0.0
- **Licence**: third-party licence, see [LICENSE](LICENSE)
- **Compatible with**: Splunk Cloud Platform and Splunk Enterprise (see
  [INSTALL.md](INSTALL.md))

## What it does

- Search for an entity (user, host, IP, application, anything) and see it
  as a graph node.
- Expand it one hop at a time to reveal related nodes - only what you
  expand is ever loaded into the browser.
- Collapse, hide, pin, filter by node/relationship type, risk score,
  event frequency, time range, index or sourcetype.
- Select any node or edge to see its properties, and drill straight down
  to the supporting Splunk events through a bounded, pre-approved search.
- Find the shortest path between two nodes in your current view.
- Export the visible graph as JSON, CSV, or PNG.
- Administer graph limits, feature toggles and search defaults from an
  in-app Configuration page; monitor application health from a Health
  page backed by its own audit trail.

See [USER_GUIDE.md](USER_GUIDE.md) for the full walkthrough.

## Example use cases

Security investigation, Splunk knowledge-object lineage, a logging/
detection-use-case catalogue, application dependency mapping, and identity
relationship exploration - GraphLens is a generic graph explorer, not a
single hard-coded use case. See [DATA_MODEL.md](DATA_MODEL.md) for the
node/edge schema and `sample_data/` for a synthetic example covering all
five.

## Quick start

```
npm install
npm run build
npm run package        # produces dist/graphlens-1.0.0.tar.gz
```

Install the resulting archive into Splunk, create the
`graphlens_relationships` index, optionally load the bundled sample data,
and assign roles. Full steps: [INSTALL.md](INSTALL.md).

## Documentation index

| Document | Contents |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the pieces fit together |
| [DATA_MODEL.md](DATA_MODEL.md) | Node/edge schema, identifiers, KV Store collections |
| [INSTALL.md](INSTALL.md) | Installation, index creation, sample data, roles |
| [CONFIGURATION.md](CONFIGURATION.md) | `graphlens_settings.conf` reference, upgrade/rollback |
| [USER_GUIDE.md](USER_GUIDE.md) | How to use the Relationship Explorer |
| [ADMIN_GUIDE.md](ADMIN_GUIDE.md) | Roles, capabilities, KV Store management, troubleshooting |
| [SECURITY.md](SECURITY.md) | Injection/XSS prevention, access control, secrets, CSP |
| [PRIVACY.md](PRIVACY.md) | What data GraphLens stores and where |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Build/test/lint/package commands, toolchain versions |
| [TESTING.md](TESTING.md) | Test suite overview and how to run it |
| [APPINSPECT.md](APPINSPECT.md) | AppInspect command, results, remediation notes |
| [THIRDPARTY.md](THIRDPARTY.md) | Dependency inventory, licences, vulnerability status |
| [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) | What's out of scope in 1.0.0 |
| [SPLUNKBASE_SUBMISSION.md](SPLUNKBASE_SUBMISSION.md) | Draft Splunkbase listing content |
| [CHANGELOG.md](CHANGELOG.md) | Release notes |
| [SUPPORT.md](SUPPORT.md) | Support statement and contact |
| [LICENSE](LICENSE) / [NOTICE](NOTICE) | Licensing |

## Supported browsers

Current versions of Chrome, Firefox, Edge and Safari, matching whatever
browser support matrix applies to the Splunk version you install GraphLens
into.

## Constraints this application deliberately respects

No Neo4j or other external graph database; no external application
server; no external JavaScript CDNs; no unsupported Splunk Cloud
endpoints; no shell/OS access; no root privileges; no persistent
background processes; no secrets in source code; no unbounded searches;
no full-dataset loads into the browser. See
[SECURITY.md](SECURITY.md) and [ARCHITECTURE.md](ARCHITECTURE.md) for how
each of these is actually enforced, not just claimed.
