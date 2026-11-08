# Development

## Toolchain versions used to build this release

- Node.js: `>=18.0.0` (developed and tested against Node 22.22.2; CI
  should also run against the current Node LTS before release)
- npm: `>=9.0.0` (tested against npm 10.9.7)
- React: 18.2.0
- @splunk/react-ui (Splunk UI Toolkit): 5.12.0
- Cytoscape.js: 3.34.0
- webpack: 5.108.4 / babel 7.29.x / jest 29.7.0 / eslint 8.57.0

Pinned exactly in `package.json` + `package-lock.json`. See THIRDPARTY.md
for the full dependency inventory and licences.

## Commands

```
npm install       # install dependencies from the lock file
npm run lint       # eslint over src/**/*.{js,jsx}
npm run typecheck  # no-op placeholder - see "Type checking" below
npm test           # jest: unit + security + performance suites
npm run build       # production webpack build into appserver/static/build
npm run dev          # development build with --watch
npm run package      # lint + test + build + scripts/package_app.sh
npm run clean         # remove appserver/static/build
npm run verify         # lint + test + build (no packaging)
```

`npm run package` is the single command that reproduces this release's
`dist/graphlens-<version>.tar.gz`; do not hand-edit the archive.

## Type checking

GraphLens uses PropTypes + JSDoc rather than TypeScript, to keep the build
pipeline and dependency surface minimal. `npm run typecheck` is a
documented no-op rather than an omitted script, so CI pipelines that
always run `npm run typecheck` do not fail. If you convert the codebase to
TypeScript in a future version, replace this script with `tsc --noEmit`
and update this section.

## Project structure

See ARCHITECTURE.md, "Directory layout".

## Verified against a live Splunk instance

The items below were not just reasoned about - they were tested by
installing the built package into a real Splunk Enterprise 10.6.1 (build 1)
Docker container (`splunk/splunk:latest`), loading the bundled sample
data, and exercising the app end to end (login, all three views, entity
search, node expansion, evidence drilldown, KV Store writes) with a
headless browser plus direct REST calls. Three previously-unverified
assumptions turned out to be wrong and are now fixed and confirmed
working (see CHANGELOG.md 1.0.1 for the full list): the Mako template's
asset URL (`${make_url(...)}` was never actually defined in that
namespace), the CSRF header (`X-Requested-With: XMLHttpRequest` is
required alongside `X-Splunk-Form-Key`, not documented anywhere obvious),
and saved-search `args.<token>` substitution (it is silently a no-op for
a saved search's own `$token$` placeholders - replaced with ad-hoc
`services/search/jobs` dispatch of a fully-built SPL string, see
`shared/services/splTemplates.js`).

Before relying on this in a different Splunk version, re-verify:

1. **Mako view templates** (`appserver/templates/*.html`). AppInspect's
   `check_for_existence_of_python_code_block_in_mako_template` check flags
   any custom Mako template containing a `<% %>`/`<%! %>` Python code
   block as a critical risk with the remediation "Remove custom Mako
   templates." The templates use a plain, hardcoded absolute path
   (`/static/app/graphlens/build/pages/<Page>/App.js`) with **no Mako
   expressions or code blocks at all** - only `<%page>`/`<%inherit>`/`<%block>`
   tag directives, none of which are `Code` nodes, so this is both
   AppInspect-clean and confirmed working against a live instance (see
   above). The one remaining edge case, not covered by this testing: if a
   deployment mounts Splunk Web behind a non-default root path (a custom
   `MRSPARKLE_ROOT_PATH`, e.g. a path-based reverse proxy), a hardcoded
   absolute `/static/...` path would need that prefix too - verify against
   your specific deployment if you use such a setup.
2. **`@splunk/react-ui` component API**. Import paths (e.g.
   `@splunk/react-ui/Button`) and prop names used throughout
   `src/main/webapp/pages/**` were verified against the installed
   `@splunk/react-ui@5.12.0` package on disk and confirmed to render
   correctly (no console errors, all three pages' controls interactive) in
   the live-instance testing above. Exact prop-level behaviour for
   controls not exercised by that manual pass should still be spot-checked
   against that version's own TypeScript definitions
   (`node_modules/@splunk/react-ui/*.d.ts`) or Storybook.
3. **`configs/conf-graphlens_settings` REST write authorisation**. Verify
   which capability actually gates this endpoint on your target Splunk
   version (documented as `admin_all_objects` by default; see
   SECURITY.md) - Splunk's generic custom-conf REST authorisation has
   evolved across versions. Not exercised by the live testing above (the
   Configuration page's save flow was not clicked through in that pass).
4. **Splunk Cloud index-creation workflow**. INSTALL.md describes the
   general self-service/change-request pattern; the exact current UI path
   depends on your Splunk Cloud Platform experience (Classic vs Victoria)
   and stack configuration - verify against your own environment. The live
   testing above used Splunk Enterprise's CLI (`splunk add index`), not
   Splunk Cloud's own workflow.
5. **AppInspect and Splunk Cloud vetting**. This package was validated
   with `splunk-appinspect==4.2.1` (the latest available at build time -
   see APPINSPECT.md for the exact command and result). Re-run AppInspect
   with whatever is current at release time, since new checks are added
   regularly.

## Bumping the version

Every place a version string is written must be updated together - a
1.0.1 release missed two of these on the first pass, caught only by
noticing the Health page still displayed "1.0.0" during live-instance
verification:

- `app.manifest` (`info.id.version`)
- `default/app.conf` (`[launcher] version` and `[id] version`)
- `package.json` (`version`) and the regenerated `package-lock.json`
  (`npm install --package-lock-only`)
- `const APP_VERSION` in `src/main/webapp/pages/RelationshipExplorer/App.jsx`
  and `src/main/webapp/pages/HealthPage/App.jsx` (used in export metadata
  and the Health page's own display - not sourced from `package.json` at
  build time, so it does not update itself)
- `CHANGELOG.md` (new version heading)

## Dependency updates

1. `npm outdated` to see what has moved.
2. Update one package at a time in `package.json`, run
   `npm install`, then `npm run verify`.
3. Re-run `npm audit` and update THIRDPARTY.md's "Vulnerability status"
   section with the date and result.
4. Re-check the updated package's licence (`node_modules/<pkg>/package.json`
   `license` field) and update THIRDPARTY.md if it changed.
5. Re-run AppInspect (APPINSPECT.md) before releasing.

## Removed from the production build

The build/packaging pipeline (`npm run build` + `scripts/package_app.sh`)
never ships: `node_modules/`, `src/` (raw JSX source), `tests/`,
`webpack.config.js`, `.babelrc`, `jest.config.js`, `.eslintrc.json`,
`scripts/`, `sample_data/`, source maps (`*.map`), or editor/OS junk files
(`.DS_Store`, `Thumbs.db`). Only `app.manifest`, `default/`, `metadata/`,
`static/`, `lookups/`, `appserver/static/build/`, `appserver/templates/`,
and the top-level documentation files are staged into the distributable
archive - see `scripts/package_app.sh`.
