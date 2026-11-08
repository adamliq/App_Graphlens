# RBAC model

GraphLens can build and explore a graph of this Splunk instance's own
access-control structure: roles, the capabilities each role grants, the
indexes each role can search, role inheritance, and - where SAML or LDAP
is configured - which identity-provider groups map to which roles. It uses
the same Relationship Explorer, same node/edge schema, and same filters as
any other GraphLens data - RBAC is modelled as just another relationship
graph, not a separate feature.

This is **disabled by default**. It is the one part of GraphLens that
collects data server-side rather than visualising data you already have in
Splunk, and the data it produces is itself sensitive (see SECURITY.md,
"RBAC model collector", before enabling it).

## What it collects

| Node type | Represents | Example `node_id` |
|---|---|---|
| `role` | A Splunk role | `role:power` |
| `privilege` | A Splunk capability | `privilege:admin_all_objects` |
| `index` | A Splunk index a role can search | `index:main` |
| `saml_group` | A SAML group mapped to one or more roles | `saml_group:domain-admins-a1b2c3d4` |
| `ldap_group` | An LDAP group mapped to one or more roles | `ldap_group:cn-admins-ou-groups-e5f6a7b8` |
| `identity_provider` | The configured SAML/LDAP strategy itself | `identity_provider:SAML` |

| Relationship type | Edge | Meaning |
|---|---|---|
| `GRANTS` | role -> privilege | This role has this capability |
| `CAN_SEARCH` | role -> index | This role's `srchIndexesAllowed` includes this index |
| `INHERITS_FROM` | role -> role | This role imports another role (`imported_roles`) |
| `HAS_ROLE` | group -> role | This SAML/LDAP group maps to this role |
| `AUTHENTICATES_VIA` | group -> identity_provider | This group belongs to this identity provider |

All of these node/relationship types are seeded into
`graphlens_node_types`/`graphlens_relationship_types` via
`lookups/graphlens_node_types_seed.csv` and
`lookups/graphlens_relationship_types_seed.csv` (see DATA_INGESTION.md's
seeding step) - `role`, `privilege`, `index` and `identity_provider` were
already present for general-purpose use; `saml_group`, `ldap_group`,
`CAN_SEARCH` and `INHERITS_FROM` were added for this feature.

A literal index wildcard (`*`) is shown as a single `index:all-indexes`
node rather than one node per actual index, since the role grants access
via the wildcard, not via individually-enumerated indexes. A narrower
wildcard pattern (e.g. `_*`) gets its own sanitised node with the original
pattern preserved in its label.

### A note on `risk_score`

Capabilities in a small, explicitly-listed set considered broadly
high-impact if over-assigned (`admin_all_objects`, `edit_user`,
`change_authentication`, `edit_roles`, and similar) are scored 80; every
other capability is scored 20. This is a starting point, not a security
assessment - edit `SENSITIVE_CAPABILITIES` in
`bin/graphlens_rbac_collector.py` for your own environment's notion of
"sensitive." It only affects the colour/filtering GraphLens shows; it
never changes which edges are collected.

## Setup

1. Review SECURITY.md's "RBAC model collector" section and decide where
   this should write to - the default `graphlens_relationships` index (so
   it's immediately visible alongside everything else), or a separate,
   more tightly access-controlled index.
2. If using a separate index, create it and edit `index =` in
   `default/inputs.conf`'s `[script://./bin/graphlens_rbac_collector.py]`
   stanza to match (and consider also updating the `OUTPUT_INDEX` default
   near the top of `bin/graphlens_rbac_collector.py` so the events'
   `source_index` field matches - cosmetic only, shown in the details
   panel).
3. Set `disabled = false` in that same stanza. Adjust `interval` (seconds
   between runs; default 86400 = daily) to match how often your
   roles/capabilities/group mappings actually change.
4. Restart Splunk, or wait for the next scheduled check of inputs.conf.
5. Confirm it ran: `index=<your index> sourcetype=graphlens:relationship
   source_index=role:*` (adjust to your actual index) should return rows,
   and `btool` / `_internal` logs for `graphlens_rbac_collector` will show
   anything it logged to stderr (see "Troubleshooting" below).
6. Search for a role (e.g. `admin`) in the Relationship Explorer and
   expand it to see its capabilities, indexes and inherited roles.

No new capability or role is required to *run* the collector - it
authenticates as `splunk-system-user` via `passAuth`, independent of any
GraphLens role. Which GraphLens users can *see* the resulting data is
governed entirely by standard Splunk index-level access control
(`srchIndexesAllowed`) on whichever index you pointed it at - same as any
other data source in this app.

## Identity provider support

The collector reads `authentication.conf`'s `[authentication]` stanza to
determine the configured `authType` (`Splunk` native, `SAML`, `LDAP`, or
other), then looks for `roleMap_<strategy>` stanzas - `roleMap_SAML` for
SAML, `roleMap_<name>` for each configured LDAP strategy name - and treats
each key as a role name and its value as a semicolon-separated list of
groups mapped to that role (not comma-separated - an LDAP group is
routinely a full DN that legitimately contains commas, which is exactly
why Splunk's own convention uses semicolon here), per Splunk's own
`authentication.conf` convention. A `Splunk`-native (no SAML/LDAP) instance simply has no
`roleMap_*` stanzas, so no group/identity-provider nodes are produced -
only roles, capabilities, indexes and role inheritance.

**This repository's test environment has no SAML or LDAP identity
provider configured**, so - unlike the role/capability/index REST calls,
which were checked against a live Splunk Enterprise 10.6.1 (build 1)
instance (see DEVELOPMENT.md) - the `roleMap_<strategy>` parsing has not
been checked against a live SAML- or LDAP-configured instance. It follows
documented Splunk convention, but this app's own track record (see
CHANGELOG.md 1.0.1) is that documented-but-unverified assumptions about
Splunk internals have turned out wrong before. Before relying on the
group/role edges this produces: enable the collector against your actual
SAML/LDAP-configured instance, confirm the resulting `saml_group`/
`ldap_group` nodes and their `HAS_ROLE` edges match what you expect, and
report back (or fix `parse_identity_provider()` in
`bin/graphlens_rbac_collector.py`) if they don't. See KNOWN_LIMITATIONS.md.

## Troubleshooting

- **No RBAC nodes appear at all**: confirm the input is enabled
  (`disabled = false`) and has run at least once (`interval` seconds after
  Splunk start/restart, or since the config was reloaded). Check
  `index=_internal sourcetype=splunkd component=ExecProcessor
  graphlens_rbac_collector` for scheduler/launch errors.
- **Script prints nothing and exits non-zero immediately**: it logs `no
  session key on stdin` if invoked without `passAuth` providing one - this
  means it was run some other way than as a configured scripted input
  (e.g. manually from a shell). Confirm `passAuth = splunk-system-user` is
  present in the stanza.
- **REST errors logged to stderr**: `admin_all_objects`-equivalent access
  is required to read `/services/authorization/roles` for *other* roles
  and `/servicesNS/-/-/configs/conf-authentication`; `passAuth =
  splunk-system-user` should already provide this, so an auth error here
  usually means the stanza's `passAuth` setting was removed or the
  instance has an unusual authentication configuration - check
  `index=_internal` for the exact HTTP status logged.
- **Group/role edges missing on a SAML/LDAP instance**: see "Identity
  provider support" above - this is the one unverified code path; add a
  stderr log line locally (or test `parse_identity_provider()` directly
  against your `/servicesNS/-/-/configs/conf-authentication` response) to
  confirm the `roleMap_*` stanza names and separator match what your
  instance actually produces.
