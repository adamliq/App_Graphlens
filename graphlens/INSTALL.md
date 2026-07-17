# Installation

## Supported platforms

- Splunk Cloud Platform (Victoria Experience and Classic Experience) -
  verify current compatibility against the Splunk Cloud Platform
  compatibility matrix for the exact platform version you are deploying
  to before installing, since supported versions change over time.
- Splunk Enterprise, minimum version `<MINIMUM_SPLUNK_VERSION>` - set this
  to the oldest Splunk Enterprise version you have actually validated
  GraphLens against (recommended: validate against the current Splunk
  Enterprise LTS at time of release and record that version here; do not
  leave this placeholder unset before Splunkbase submission).

## Supported browsers

Current versions of Chrome, Firefox, Edge, and Safari (matching the
browser support matrix of the Splunk version you are installing into -
GraphLens does not extend or restrict that matrix on its own).

## 1. Build the application (if installing from source)

If you received GraphLens as a pre-built `.tar.gz`/`.spl` from
Splunkbase, skip to step 2. If building from source:

```
npm install
npm run build
npm run package
```

This produces `dist/graphlens-<version>.tar.gz` (see DEVELOPMENT.md for
the full build pipeline).

## 2. Install the app

**Splunk Cloud Platform**: upload `graphlens-<version>.tar.gz` through
Splunk Cloud's self-service app installation (Apps > Manage Apps > Install
app from file), or through your organisation's Splunk Cloud app-approval
workflow if self-service installation is not enabled for your stack.

**Splunk Enterprise**: Apps > Manage Apps > Install app from file, or
extract the archive so that a single `graphlens/` directory ends up under
`$SPLUNK_HOME/etc/apps/`, then restart Splunk (or run `splunk restart` /
enable via the Apps UI).

GraphLens installs with `is_configured = false` and does not create any
index, KV Store data, or scheduled search automatically beyond what is
declared in `default/` - see the next two steps for what you must do
yourself.

## 3. Create the relationship index (required for indexed relationship data)

GraphLens does **not** create an index automatically - see
`scripts/indexes.conf.example` for a template. On Splunk Enterprise,
create an index named `graphlens_relationships` (or choose your own name
and update `graphlens_settings.conf`'s `[search] relationship_index`
accordingly) via Settings > Indexes > New Index. On Splunk Cloud Platform,
create it through your normal Splunk Cloud index-management workflow
(self-service index management UI, or a change request through your
Splunk Cloud admin process).

If you only intend to use GraphLens against curated KV Store data (no
time-series observed relationships), you can skip index creation, but the
`graphlens_expand_node`/`graphlens_initial_entity_search` searches will
then return no results until you index at least some relationship events
or otherwise adapt those saved searches to your own data source.

## 4. Load sample/starting data (optional, recommended for evaluation)

To try GraphLens with the bundled synthetic sample data:

1. Regenerate the CSVs if needed: `python3 scripts/generate_sample_data.py`
   (they are already committed under `sample_data/`).
2. Index `sample_data/graphlens_relationships_sample.csv` into the
   `graphlens_relationships` index with sourcetype
   `graphlens:relationship` (Splunk Web > Add Data > Upload works for a
   one-time evaluation load; for Splunk Cloud, use your normal
   Cloud-supported data-onboarding method for a one-time file upload, e.g.
   the Cloud Monitoring Console's upload workflow or a HEC-based loader
   you already operate).
3. Seed the type-display KV Store collections from the bundled CSVs (run
   once, from Splunk Search, as a user with `graphlens_manage_collections`):

   ```spl
   | inputlookup graphlens_sample_node_types | outputlookup graphlens_node_types
   | inputlookup graphlens_sample_relationship_types | outputlookup graphlens_relationship_types
   ```

## 5. Assign roles

Import GraphLens's example roles into your own role structure (see
ADMIN_GUIDE.md for details), or add the individual `graphlens_*`
capabilities from `default/authorize.conf` to your existing roles:

- Read-only analysts: `role_graphlens_viewer`
- Analysts who annotate/save views: `role_graphlens_analyst`
- Administrators: `role_graphlens_admin`

Assign the app itself to the relevant roles (Settings > Roles >
App/Permissions, or your existing app-assignment process), so GraphLens
appears in those users' app list.

## 6. Verify

1. Open the GraphLens app; the Relationship Explorer should load with no
   browser console errors.
2. Search for `jsmith` (if you loaded sample data) - a node should appear.
3. Double-click the node to expand it; related nodes should appear within
   a few seconds.
4. Open the Health page as an administrator; it should load without
   error (an empty audit log is expected immediately after install).

## Upgrading

See CONFIGURATION.md, "Upgrade" for what is preserved (local
configuration, KV Store data, saved views) versus what is replaced
(everything under `default/`). Never edit files under `default/` directly
- put overrides in `local/`.

## Uninstallation

Remove the app through Settings > Apps > graphlens > Delete, or remove the
`graphlens/` directory from `$SPLUNK_HOME/etc/apps/` and restart. This
does **not** automatically delete the `graphlens_relationships` index or
its data (indexes persist independently of apps in Splunk by design) - if
you want to remove the underlying data too, delete the index separately
through your normal index-management process. KV Store data owned by the
app's collections is removed along with the app.
