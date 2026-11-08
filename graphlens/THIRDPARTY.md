# Third-party dependencies

GraphLens is built with the following third-party open-source components.
Runtime dependencies are bundled into the compiled bundles under
`appserver/static/build/`; development dependencies are used only to
build, lint, test and package the application and are never shipped.

This inventory was generated against the exact versions pinned in
`package.json` / `package-lock.json`. Regenerate it after any dependency
update with `npm ls --all` and `npm audit`, and re-check each changed
package's licence before merging (see DEVELOPMENT.md, "Dependency
updates").

## Runtime dependencies (bundled into the browser build)

| Package | Version | Licence | Purpose |
|---|---|---|---|
| react | 18.2.0 | MIT | UI framework |
| react-dom | 18.2.0 | MIT | React DOM renderer |
| @splunk/react-ui | 5.12.0 | Apache-2.0 | Splunk UI Toolkit components (buttons, inputs, modals, selects, notifications) |
| styled-components | 5.3.11 | MIT | Peer dependency of @splunk/react-ui, used internally by its components |
| cytoscape | 3.34.0 | MIT | Graph visualisation and layout engine |
| prop-types | 15.8.1 | MIT | Runtime React prop validation |

@splunk/react-ui also pulls in a small number of its own runtime
dependencies (`@splunk/react-icons`, `@splunk/themes`, `@splunk/ui-utils`,
`@dnd-kit/*`, `@react-spring/web`, `decimal.js-light`, `intl-tel-input`,
`lodash`, `moment`, `react-markdown`, `remark-gfm`, `use-sync-external-store`,
`use-typed-event-listener`), each under a permissive OSS licence (MIT or
Apache-2.0/ISC). Run `npm ls @splunk/react-ui --all` for the exact
transitive tree and consult each package's own LICENSE for full text.

## Build/test/lint dependencies (not shipped)

| Package | Version | Licence |
|---|---|---|
| @babel/core | 7.29.7 | MIT |
| @babel/preset-env | 7.28.3 | MIT |
| @babel/preset-react | 7.27.1 | MIT |
| babel-jest | 29.7.0 | MIT |
| babel-loader | 9.1.3 | MIT |
| css-loader | 6.10.0 | MIT |
| eslint | 8.57.0 | MIT |
| eslint-plugin-react | 7.34.0 | MIT |
| eslint-plugin-react-hooks | 4.6.0 | MIT |
| jest | 29.7.0 | MIT |
| jest-environment-jsdom | 29.7.0 | MIT |
| mini-css-extract-plugin | 2.8.0 | MIT |
| rimraf | 5.0.5 | ISC |
| webpack | 5.108.4 | MIT |
| webpack-cli | 5.1.4 | MIT |

## Vulnerability status

`npm audit` reported **0 known vulnerabilities** against this dependency
set as of the versions pinned above (checked 2026-07-18; a transitive
`fast-uri` advisory disclosed after the 1.0.0 check was picked up and
resolved via `npm audit fix` for 1.0.1). Re-run `npm
audit` as part of every release (see the `package` script in
`package.json` / the build pipeline in DEVELOPMENT.md) and update this
section with the date and result of the most recent check.

## Software bill of materials (SBOM)

A machine-readable SBOM in CycloneDX format can be generated at any time
with:

```
npx @cyclonedx/cyclonedx-npm --output-file sbom.cdx.json
```

`@cyclonedx/cyclonedx-npm` is not a project dependency (it is not listed in
package.json) so it does not affect the runtime bundle or THIRDPARTY.md's
own inventory; run it on demand as part of the release checklist in
DEVELOPMENT.md and attach the generated `sbom.cdx.json` to the release.

## Removed / avoided dependencies

GraphLens deliberately does not depend on:

- Any Neo4j client, driver, or browser/bloom component.
- Any graph-layout dependency that is not packaged inside the app
  (dagre/cola-style extra Cytoscape.js layouts are not included in 1.0.0;
  only the layouts built into cytoscape core - cose, concentric,
  breadthfirst, circle, grid - are used, precisely so no extra runtime
  dependency has to be vetted or packaged for them).
- Any package that fetches remote code at runtime (CDNs, dynamic
  `import()` of remote URLs, `eval`, or `new Function`).
- Any UI framework other than React + @splunk/react-ui.

## Licence texts

Full licence text for every bundled runtime package is available in each
package's own `node_modules/<package>/LICENSE` file during development,
and is additionally preserved in the generated
`appserver/static/build/pages/*/App.js.LICENSE.txt` files produced by the
production build (webpack's Terser plugin extracts and keeps third-party
licence banners rather than stripping them) - do not remove these files
from the packaged application.
