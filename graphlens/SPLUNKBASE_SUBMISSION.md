# Splunkbase submission content

Draft text for the Splunkbase listing. Fill in the placeholders (marked
`<...>`) before submitting; do not submit with placeholders still present.

## Title

GraphLens

## Short description (≤ 200 characters)

Interactive, Neo4j-like relationship graph exploration for data already in
Splunk - search, expand, filter and investigate node-and-edge data natively
in Splunk Cloud Platform. No Neo4j required.

## Full description

GraphLens is an independent, third-party Splunk application that brings an
interactive, node-and-edge relationship-graph experience to Splunk Cloud
Platform and Splunk Enterprise - entirely within Splunk. It does not
require, embed, or connect to Neo4j or any other external graph database.

Search for an entity - a user, host, IP address, application, or any other
node in your data - and GraphLens shows it as a graph node. Expand it to
reveal directly related nodes one hop at a time, filter by node type,
relationship type, risk score, event frequency, time range, index or
sourcetype, pin and hide nodes as you investigate, trace the shortest path
between two nodes in your current view, and drill down from any node or
relationship straight to the supporting Splunk events - all through
bounded, pre-approved searches that respect your existing Splunk role
permissions.

Use it for security investigations (alert -> user -> host -> process -> IP
-> domain -> threat indicator), Splunk knowledge-object lineage
(dashboard -> saved search -> macro -> lookup -> data model -> sourcetype
-> index), a logging/detection catalogue, application dependency mapping,
or identity relationship exploration - GraphLens is a generic graph
explorer, not a single-purpose dashboard.

Built with Cytoscape.js and the Splunk UI Toolkit (React + @splunk/react-ui),
GraphLens uses Splunk as its sole data store, search engine, and security
boundary: no external application server, no external database, no
external network calls, and no server-side code of GraphLens's own (every
backend interaction is a documented, supported Splunk REST API call).

## Release notes

See CHANGELOG.md.

## Installation instructions

See INSTALL.md.

## Configuration instructions

See CONFIGURATION.md and ADMIN_GUIDE.md.

## Upgrade instructions

See CONFIGURATION.md, "Upgrade".

## Uninstallation instructions

See INSTALL.md, "Uninstallation".

## Support statement

See SUPPORT.md. GraphLens is supported by its vendor
(Adam Liquorish), not by Splunk Inc.

## Compatibility statement

- Splunk Cloud Platform (verify current platform compatibility before
  submission - see INSTALL.md).
- Splunk Enterprise, minimum version `<MINIMUM_SPLUNK_VERSION>`.
- Does not require Neo4j or any external graph database.
- Uses Splunk UI Toolkit (React + @splunk/react-ui) and Cytoscape.js,
  bundled - no external runtime dependency, no CDN.

## Licence

Third-party licence - see LICENSE. GraphLens is not a Splunk Inc. product.

## Privacy statement

See PRIVACY.md.

## Security contact

See SECURITY.md.

## Vendor information

- Vendor / author: Adam Liquorish
- Support: see SUPPORT.md

## Screenshots

`<Add at least: (1) the Relationship Explorer with an expanded graph, (2)
the node/edge details panel, (3) the evidence panel, (4) the Configuration
page, (5) the Health page. None currently exist in this repository -
capture them from a running instance before submission.>`

## App icon / logo

Placeholder icons are included at `static/appIcon.png`, `appIcon_2x.png`,
`appLogo.png`, `appLogo_2x.png` (see KNOWN_LIMITATIONS.md). Replace with
final designed artwork before submission.

## Example graph

See `sample_data/` and INSTALL.md step 4 for a synthetic dataset covering
five example use cases you can use for a Splunkbase demo screenshot or
video.

## Known limitations

See KNOWN_LIMITATIONS.md - summarise the security/functional-scope items
from that document in the Splunkbase listing's "Known Issues" field.

## Third-party dependency disclosure

See THIRDPARTY.md.

## AppInspect evidence

See APPINSPECT.md - 0 errors, 0 failures, 2 justified warnings as of the
last validation run recorded there. Re-run immediately before submission
and update APPINSPECT.md with the fresh result.

## Documentation links

`<Publish README.md and the other top-level docs alongside your source
repository or a documentation site, and link them here.>`

## Source-code repository

`<SOURCE_REPOSITORY_URL>`

## Do not claim

Do not state or imply Splunk certification, Splunk endorsement, or
Splunkbase approval anywhere in the listing until Splunk has actually
granted it. Do not use "Splunk" in the app name in a way that implies it
is an official Splunk product (the name "GraphLens" does not).
