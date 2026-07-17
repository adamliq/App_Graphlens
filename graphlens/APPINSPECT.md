# AppInspect

## Command used

```bash
python3 -m venv appinspect-venv
source appinspect-venv/bin/activate
pip install splunk-appinspect

npm run build
bash scripts/package_app.sh          # produces dist/graphlens-1.0.0.tar.gz

splunk-appinspect inspect dist/graphlens-1.0.0.tar.gz \
  --output-file appinspect-report.json
```

## Tooling version

`splunk-appinspect==4.2.1` (the latest version published on PyPI at the
time this package was validated - 2026-07-17). AppInspect's own trusted-
library metadata update failed in the sandboxed build environment used for
this validation run (no outbound access to Splunk's metadata service);
the report notes "the validation results might differ from the AppInspect
API" as a result. **Re-run AppInspect with network access to Splunk's
trusted-library metadata service (or via the hosted AppInspect API/Splunk
Cloud's own vetting pipeline) before final submission**, since that
service can surface additional, environment-dependent findings (e.g.
newly disclosed vulnerable third-party libraries) that a fully offline run
cannot.

## Result summary (this validation run)

```
error:          0
failure:        0
future_failure:  0
skipped:        0
not_applicable: 118
warning:        2
success:        129
-------------------
Total:          249
```

**Zero errors, zero failures.** Two warnings remain, both reviewed and
accepted with justification below (per the requirement not to suppress
findings without written justification).

## Remediation notes (fixed during development)

AppInspect surfaced six warnings that were fixed, not suppressed:

1. **`check_for_existence_of_python_code_block_in_mako_template`** - the
   three custom Mako views under `appserver/templates/` originally
   contained a `<%! import splunk.appserver.mrsparkle.lib.util as util %>`
   module-level Python code block. Fixed by removing the import block
   entirely and calling `${make_url(...)}` directly (a Mako *expression*,
   not a *code block* - AppInspect's check specifically inspects the
   parsed Mako AST for `Code` nodes, which `<%!%>`/`<%%>` blocks produce
   and `${}` expressions/`<%tag>` directives do not - verified by reading
   `splunk_appinspect/check_routine/__init__.py:is_mako_template` and
   `mako/parsetree.py`'s `Code`/`Expression`/`Tag` class hierarchy
   directly from the installed packages). See DEVELOPMENT.md item 1 for
   the runtime-verification caveat this introduces.
2. **`check_version_is_valid_semver`** / **`check_for_valid_package_id`**
   - `app.conf` had no `[id]` stanza. Fixed by adding
   `[id] name = graphlens` / `version = 1.0.0`.
3. **`check_for_updates_disabled`** - `[package]` had no
   `check_for_updates` setting. Fixed by setting it explicitly to `true`
   (see the warning that remains, below, for why `true` and not `false`).
4. **`check_custom_conf_replication`** - the app ships one custom conf
   file (`graphlens_settings.conf`) with no matching
   `conf_replication_include` entry for search head clustering. Fixed by
   adding `default/server.conf` with
   `[shclustering] conf_replication_include.graphlens_settings = true`.
5. **`check_kos_are_accessible`** - `metadata/default.meta` referenced the
   `admin` role for write access, which is not available to Splunk Cloud
   customers directly. Fixed by adding `sc_admin` alongside `admin` on
   every ACL line.
6. **`check_hostnames_and_ips`** - a code comment in `default/macros.conf`
   used the RFC 5737 documentation IP `198.51.100.10` as an example, which
   the scanner flags as a private-IP-shaped literal regardless of context.
   Fixed by rewording the comment to use a hostname example instead, since
   the IP literal added no essential information.

## Warnings accepted with justification (not suppressed, not "fixed")

1. **`check_for_updates_disabled`** - "check_for_updates property found in
   `[package]` stanza is set to True for private app not uploaded to
   Splunkbase. It should be set to False for private apps not uploaded to
   Splunkbase." **Accepted as expected behaviour.** GraphLens is built for
   public Splunkbase distribution (see SPLUNKBASE_SUBMISSION.md), and the
   design brief this app was built against explicitly requires "Do not
   disable application update checking." AppInspect's offline CLI run
   cannot know the app's distribution intent and defaults to assuming a
   private/non-Splunkbase context, which is why it warns here; the
   Splunk Cloud vetting pipeline and Splunkbase's own submission process
   are the authoritative checks for a public app and do not penalise
   `check_for_updates = true`. Do not change this to `false`.
2. **`check_collections_conf`** - "App contains collections.conf. No
   action required." This is an informational-only check (its own message
   says no action is required); it exists to prompt a manual reviewer to
   look at collections.conf, not to flag a problem. No action taken.

## Manual-review items

AppInspect's automated checks cannot verify:

- That the three Mako view templates actually render correctly against a
  live Splunk Web instance (see DEVELOPMENT.md item 1) - **requires manual
  verification on a real Splunk Cloud/Enterprise instance before release.**
- That `@splunk/react-ui` component props behave as written against the
  exact pinned version in a live browser (see DEVELOPMENT.md item 2).
- Functional correctness of the graph explorer (search, expand, collapse,
  filters, evidence, export, path finder) - covered by the automated test
  suite (TESTING.md) plus recommended manual smoke testing before release.
- The exact capability that gates `configs/conf-graphlens_settings` REST
  writes on your target Splunk version (see SECURITY.md).

## Cloud-vetting readiness statement

Based on this validation run, GraphLens 1.0.0 has **zero AppInspect
errors or failures** and two reviewed, justified warnings. This is a
strong signal of Splunk Cloud vetting readiness, but it is **not** a
certification of AppInspect success by Splunk, nor a guarantee of
Splunkbase or Splunk Cloud vetting approval - re-run AppInspect (ideally
via Splunk's hosted API, which has access to trusted-library metadata this
offline run could not reach) immediately before submission, and address
any new findings a more current AppInspect release surfaces. Do not claim
Splunk certification or Splunkbase approval until Splunk has actually
granted it.

## Package integrity checks performed manually

- Single top-level `graphlens/` folder in the archive (verified via
  `tar -tzf`).
- No parent-directory (`../`) entries.
- No `.git`, `node_modules`, `.DS_Store`, or `Thumbs.db` in the packaged
  archive (excluded by `scripts/package_app.sh`; verified by listing
  archive contents).
- No `*.map` source maps in the packaged archive.
- No secrets or sample credentials anywhere in the repository (manual
  review; nothing in `default/`, `metadata/`, or `sample_data/` contains
  credential-shaped values - sample data uses only RFC 5737/3849
  documentation IP ranges and fictitious names).
- Version numbers match across `app.manifest`, `default/app.conf`
  (`[launcher] version` and the new `[id] version`), and `package.json`
  (all `1.0.0`).
- SHA-256 checksum generated alongside the archive by
  `scripts/package_app.sh` (`dist/graphlens-1.0.0.tar.gz.sha256`).
