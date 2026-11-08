# AppInspect

## Command used

```bash
python3 -m venv appinspect-venv
source appinspect-venv/bin/activate
pip install splunk-appinspect

npm run build
bash scripts/package_app.sh          # produces dist/graphlens-<version>.tar.gz

splunk-appinspect inspect dist/graphlens-<version>.tar.gz \
  --output-file appinspect-report.json
```

## Tooling version

Run twice, against two different `splunk-appinspect` releases, because the
second run (for the 1.0.1 patch) happened in a fresh environment that
`pip install`ed whatever was current at the time:

- **1.0.0 validation**: `splunk-appinspect==4.2.1` (2026-07-17).
- **1.0.1 validation**: `splunk-appinspect==4.4.0` (2026-11-08) - a later
  release picked up a **new check that did not exist in 4.2.1**
  (`check_for_custom_mako_templates`, see below), which is exactly why
  re-running AppInspect with whatever is current, not pinning an old
  version, matters.

AppInspect's own trusted-library metadata update failed in the sandboxed
build environment used for both validation runs (no outbound access to
Splunk's metadata service); the report notes "the validation results
might differ from the AppInspect API" as a result. **Re-run AppInspect
with network access to Splunk's trusted-library metadata service (or via
the hosted AppInspect API/Splunk Cloud's own vetting pipeline) before
final submission**, since that service can surface additional,
environment-dependent findings (e.g. newly disclosed vulnerable
third-party libraries) that a fully offline run cannot.

## Result summary (1.0.1 validation run, splunk-appinspect 4.4.0)

```
error:          0
failure:        0
future_failure:  0
skipped:        0
not_applicable: 120
warning:        3
success:        131
-------------------
Total:          254
```

**Zero errors, zero failures.** Three warnings remain, all reviewed and
accepted with justification below (per the requirement not to suppress
findings without written justification): two (`check_for_updates_disabled`,
`check_collections_conf`) carried over unchanged from 1.0.0, and one
(`check_for_custom_mako_templates`) is a substantive new finding from a
newer `splunk-appinspect` release than 1.0.0 was validated against. A
fourth finding seen partway through the 1.0.1 pass - a Splunk version
number written as `10.6.1.1` in several comments, which the IP/hostname
scanner flagged as a private-IP-shaped literal - was an actual false
positive and was fixed (reworded), not accepted; it no longer appears in
the final count below.
discussed in its own section below.

## Remediation notes (fixed during development)

Across the 1.0.0 and 1.0.1 development passes, AppInspect surfaced seven
warnings that were fixed, not suppressed:

1. **`check_for_existence_of_python_code_block_in_mako_template`** (1.0.0)
   - the three custom Mako views under `appserver/templates/` originally
   contained a `<%! import splunk.appserver.mrsparkle.lib.util as util %>`
   module-level Python code block. Fixed by removing the import block
   entirely (AppInspect's check specifically inspects the parsed Mako AST
   for `Code` nodes, which only `<%!%>`/`<%%>` blocks produce - verified by
   reading `splunk_appinspect/check_routine/__init__.py:is_mako_template`
   and `mako/parsetree.py`'s `Code`/`Expression`/`Tag` class hierarchy
   directly from the installed packages). An intermediate version replaced
   the import with a bare `${make_url(...)}` expression, which is not a
   `Code` node either and stayed AppInspect-clean, but turned out to be
   **wrong at runtime** - `make_url` was not actually available as a
   global in Splunk's Mako namespace, and a live install threw an HTTP
   500 (`NameError`) opening the app. The templates now use a hardcoded
   absolute static path (`/static/app/graphlens/...`) with no Mako
   expressions or code blocks at all, confirmed rendering correctly
   against a live Splunk Enterprise 10.6.1 (build 1) instance - see
   DEVELOPMENT.md item 1 and CHANGELOG.md 1.0.1.
2. **`check_version_is_valid_semver`** / **`check_for_valid_package_id`**
   (1.0.0) - `app.conf` had no `[id]` stanza. Fixed by adding
   `[id] name = graphlens` / `version`.
3. **`check_for_updates_disabled`** (1.0.0) - `[package]` had no
   `check_for_updates` setting. Fixed by setting it explicitly to `true`
   (see the warning that remains, below, for why `true` and not `false`).
4. **`check_custom_conf_replication`** (1.0.0) - the app ships one custom
   conf file (`graphlens_settings.conf`) with no matching
   `conf_replication_include` entry for search head clustering. Fixed by
   adding `default/server.conf` with
   `[shclustering] conf_replication_include.graphlens_settings = true`.
5. **`check_kos_are_accessible`** (1.0.0) - `metadata/default.meta`
   referenced the `admin` role for write access, which is not available to
   Splunk Cloud customers directly. Fixed by adding `sc_admin` alongside
   `admin` on every ACL line.
6. **`check_hostnames_and_ips`** (1.0.0 and 1.0.1, recurring) - a scanner
   that flags any dotted-quad-looking string regardless of context, with
   two unrelated causes found across the two validation passes: an RFC
   5737 documentation IP used as an identifier example in a comment
   (1.0.0, fixed by rewording to a hostname example instead), and a Splunk
   version number written as `10.6.1.1` in several comments/docs (1.0.1,
   fixed by rewriting it as `10.6.1 (build 1)` so it no longer parses as
   an IPv4 literal). Neither was ever a real hostname/IP disclosure.
7. **`check_for_custom_mako_templates`** (introduced in a later
   `splunk-appinspect` release than 1.0.0 was validated against) - see its
   own section below; not fixed, accepted with justification.

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
3. **`check_for_custom_mako_templates`** - see below.

### `check_for_custom_mako_templates`: Mako templates are being deprecated

The 1.0.1 validation run, using `splunk-appinspect==4.4.0` (newer than the
4.2.1 used for 1.0.0), surfaced a check that did not exist in the earlier
release:

> Custom Mako template file 'appserver/templates/Health.html' is
> deprecated in Splunk Enterprise 10.4. Future Splunk platform versions
> will no longer support custom Mako templates. Remove the custom
> template.

This fires for all three of GraphLens's view templates
(`RelationshipExplorer.html`, `Health.html`, `Configuration.html`) simply
for existing as custom Mako files - unlike the earlier, narrower
`check_for_existence_of_python_code_block_in_mako_template` check (item 1
above), this one does not care whether the template contains a Python
code block; any custom Mako template triggers it.

**This is accepted as a known, documented forward-looking risk for 1.0.1,
not fixed, for two reasons:**

- It is a **warning**, not a failure - it does not block AppInspect
  passing or (as far as this check alone indicates) Splunk Cloud vetting
  today.
- The templates are **confirmed working** against a live Splunk
  Enterprise 10.6.1 (build 1) instance (see DEVELOPMENT.md and
  CHANGELOG.md 1.0.1) - 10.6.1 is newer than the 10.4 version the
  deprecation notice references, so custom Mako templates are still
  functional on current Splunk Enterprise as of this writing, even though
  Splunk has signalled they will eventually be removed.

**This is GraphLens's top known risk for a future release.** "Future
Splunk platform versions will no longer support custom Mako templates" is
an explicit statement that the Relationship Explorer, Health and
Configuration views will stop loading entirely on some future Splunk
version if nothing changes. Before that happens, GraphLens needs to move
to whatever Splunk's then-current supported mechanism is for serving a
custom React/SUIT page without a Mako view template. This document
deliberately does not guess at that mechanism, because guessing wrong
about undocumented-to-us Splunk internals is exactly what caused the
HTTP 500 and CSRF/dispatch defects fixed in 1.0.1 (see CHANGELOG.md) -
each of those was a plausible-looking assumption that turned out wrong
only when tested against a live instance. The right next step is to
consult Splunk's current Splunk UI Toolkit / Victoria Experience
documentation (and, ideally, ask Splunk directly or check what
`@splunk/create`'s current scaffolding output looks like) for the
supported replacement, then verify it the same way 1.0.1's fixes were
verified: install the built package on a real, current Splunk instance
and open each view before shipping.

## Manual-review items

AppInspect's automated checks cannot verify:

- That `@splunk/react-ui` component props behave as written against the
  exact pinned version in every control - the live-instance testing for
  1.0.1 exercised search, expansion and all three pages loading without
  console errors, but did not click through every control (see
  DEVELOPMENT.md item 2).
- The exact capability that gates `configs/conf-graphlens_settings` REST
  writes on your target Splunk version (see SECURITY.md) - not exercised
  by the 1.0.1 live-instance pass.
- Whether/when custom Mako templates actually stop working on a future
  Splunk release - see `check_for_custom_mako_templates` above.

## Cloud-vetting readiness statement

Based on the 1.0.1 validation run, GraphLens has **zero AppInspect errors
or failures** and three reviewed, justified warnings (one of them a
forward-looking deprecation risk, not a current defect). This is a strong
signal of Splunk Cloud vetting readiness, but it is **not** a
certification of AppInspect success by Splunk, nor a guarantee of
Splunkbase or Splunk Cloud vetting approval - re-run AppInspect (ideally
via Splunk's hosted API, which has access to trusted-library metadata this
offline run could not reach) immediately before submission, and address
any new findings a more current AppInspect release surfaces, the same way
`check_for_custom_mako_templates` was caught by simply using whatever
`splunk-appinspect` version was current rather than a pinned older one. Do
not claim Splunk certification or Splunkbase approval until Splunk has
actually granted it.

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
  (`[launcher] version` and the `[id] version`), and `package.json`.
- SHA-256 checksum generated alongside the archive by
  `scripts/package_app.sh`.
