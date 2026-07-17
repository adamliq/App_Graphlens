# Support

GraphLens is an independent, third-party application. It is not supported
by Splunk Inc. Support is provided by the vendor identified below on a
best-effort basis, not under a Splunk support agreement.

## Vendor

- **Vendor / author:** Adam Liquorish
- **Support contact:** `<VENDOR_SUPPORT_EMAIL>` - replace this placeholder
  with a real, monitored support address before Splunkbase submission.
- **Security contact:** see SECURITY.md.
- **Issue tracker / source repository:** `<SOURCE_REPOSITORY_URL>` -
  replace with the public or private repository URL you publish this app
  from.

## What is supported

- Installation and configuration issues on Splunk Cloud Platform and
  Splunk Enterprise versions listed in README.md as supported.
- Defects in GraphLens's own code (searches, macros, KV Store schema,
  React/SUIT frontend).
- Questions about the data model, search templates, and role/capability
  setup - see DATA_MODEL.md and ADMIN_GUIDE.md first.

## What is out of scope

- Splunk platform issues unrelated to GraphLens (contact Splunk Support or
  your Splunk Cloud account team).
- Customisations you have made to `local/` configuration files or to a
  forked copy of the source.
- Issues caused by indexes, sourcetypes, or KV Store collections that do
  not follow the schema documented in DATA_MODEL.md.

## Before opening a support request

1. Check TROUBLESHOOTING guidance in ADMIN_GUIDE.md.
2. Check the Health page (`graphlens_health` view) for recent error
   patterns.
3. Confirm you are running a supported browser (see README.md) and a
   supported Splunk version (see INSTALL.md).
4. Collect: GraphLens version (Health page), Splunk version, browser and
   version, steps to reproduce, and any browser console errors (with
   sensitive values redacted).

## Response times

This is a third-party app maintained outside of Splunk's SLA structure.
No specific response-time commitment is made in this document; replace
this section with your own SLA if you offer one.
