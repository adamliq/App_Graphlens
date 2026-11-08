#!/usr/bin/env python3
"""GraphLens RBAC model collector.

A Splunk scripted input (see default/inputs.conf) that snapshots this
Splunk instance's own access-control model - roles, capabilities, the
indexes each role can search, role inheritance, and (where SAML or LDAP
is configured) which identity-provider groups map to which roles - and
emits it as graphlens_relationships-shaped CSV rows on stdout, the same
schema any other GraphLens data source uses (see DATA_MODEL.md and
RBAC_MODEL.md).

Disabled by default (see default/inputs.conf) - this snapshots your
access-control structure, which is itself sensitive. See RBAC_MODEL.md
and SECURITY.md before enabling it.

How it authenticates: Splunk scripted inputs configured with
`passAuth = splunk-system-user` have a valid session key written to
their stdin by splunkd on every invocation, as a first line of the form
`sessionKey=<key>`. This script reads that line and uses the key to call
splunkd's own REST API on localhost - no credentials are stored in this
app, and no network access beyond localhost is ever made.

What is VERIFIED against a live instance (Splunk Enterprise 10.6.1,
build 1, see DEVELOPMENT.md): /services/authorization/roles returns
content.capabilities, content.imported_roles, content.srchIndexesAllowed
and content.srchIndexesDefault as JSON arrays; the generic conf-file
endpoint /servicesNS/-/-/configs/conf-authentication returns every
authentication.conf stanza, and the "authentication" stanza carries
authType (default "Splunk" with no SAML/LDAP configured).

What is NOT verified against a live instance: the roleMap_<strategy>
stanza convention this script relies on to find SAML/LDAP group-to-role
mappings (documented, long-standing Splunk behaviour - authentication.conf
stanzas named roleMap_SAML for SAML, roleMap_<ldap_strategy_name> for each
configured LDAP strategy, each key a role name and value a
semicolon-separated list of groups). This repository's test environment has
no SAML or LDAP identity provider configured, so this part could not be
checked against a running instance the way the rest of this app's REST
assumptions were (see KNOWN_LIMITATIONS.md). Verify against your own
SAML/LDAP-configured instance before relying on the group/role edges this
produces, the same way every other previously-unverified assumption in
this app turned out to need live checking before being trusted.
"""
import csv
import hashlib
import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

SPLUNKD_URI = os.environ.get("GRAPHLENS_SPLUNKD_URI", "https://127.0.0.1:8089")
# Written into each row's source_index field - purely informational (these
# rows carry no evidence_reference, so nothing depends on this matching
# where events actually land). If you redirect this collector to a
# different index via inputs.conf's `index =`, update this default (or set
# GRAPHLENS_RBAC_OUTPUT_INDEX) to match, or just leave it - it only affects
# what the details panel displays under "Source index".
OUTPUT_INDEX = os.environ.get("GRAPHLENS_RBAC_OUTPUT_INDEX", "graphlens_relationships")
OUTPUT_SOURCETYPE = "graphlens:relationship"
REQUEST_TIMEOUT_SECONDS = 60

CSV_FIELDS = [
    "edge_id", "source_id", "source_type", "source_label",
    "target_id", "target_type", "target_label",
    "relationship_type", "relationship_label",
    "event_count", "first_seen", "last_seen", "risk_score",
    "source_index", "source_sourcetype", "evidence_reference",
]

_UNSAFE_ID_CHARS = re.compile(r"[^A-Za-z0-9:_\-.@/]")

# Starting point only, not exhaustive - a small set of capabilities whose
# presence on a role is widely considered high-impact if over-assigned.
# Extend this list for your own environment; it only affects the
# risk_score GraphLens displays/filters on, never which edges are emitted.
SENSITIVE_CAPABILITIES = {
    "admin_all_objects", "edit_user", "edit_roles", "edit_passwords",
    "change_authentication", "edit_tcp", "edit_udp", "edit_forwarders",
    "edit_search_server", "edit_deployment_server", "restart_splunkd",
    "edit_httpauths", "delete_by_keyword", "edit_storage_passwords",
    "output_file", "run_debug_commands",
}


def log(message):
    sys.stderr.write("graphlens_rbac_collector: %s\n" % message)
    sys.stderr.flush()


def read_session_key():
    """Read the session key splunkd passes on stdin (passAuth = splunk-system-user)."""
    first_line = sys.stdin.readline()
    if first_line.startswith("sessionKey="):
        return first_line[len("sessionKey="):].strip()
    return None


def rest_get(session_key, path):
    url = SPLUNKD_URI + path
    request = urllib.request.Request(url, headers={"Authorization": "Splunk " + session_key})
    # localhost management port, self-signed by default - never used for
    # any non-localhost request.
    context = ssl._create_unverified_context()
    with urllib.request.urlopen(request, context=context, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        return json.loads(response.read().decode("utf-8"))


def safe_id(raw, prefix):
    """Turn an arbitrary Splunk-reported name into a valid GraphLens node_id.

    GraphLens node/edge identifiers must match splSafety.js's ID_PATTERN
    (^[A-Za-z0-9][A-Za-z0-9:_\\-.@/]{0,254}$). Role and capability names are
    already safe in practice, but index wildcards ("*", "_*") and SAML/LDAP
    group names (which can be full LDAP DNs containing commas, spaces and
    "=") routinely are not - this is applied to every identifier uniformly
    rather than assuming any one source is well-behaved.
    """
    raw = (raw or "").strip()
    if raw == "*":
        return prefix + ":all-indexes" if prefix == "index" else prefix + ":wildcard"
    stripped = _UNSAFE_ID_CHARS.sub("-", raw).strip("-") or "unknown"
    altered = stripped != raw
    if not re.match(r"^[A-Za-z0-9]", stripped):
        stripped = "x" + stripped
        altered = True
    if altered:
        # Characters were removed/replaced or a prefix was added to satisfy
        # the pattern - append a short stable hash of the original value so
        # two different raw names never collide after sanitising.
        digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:8]
        stripped = "%s-%s" % (stripped, digest)
    return (prefix + ":" + stripped)[:255]


def edge_id(source_id, target_id, relationship_type):
    digest = hashlib.sha256(("%s|%s|%s" % (source_id, target_id, relationship_type)).encode("utf-8")).hexdigest()[:12]
    return "edge:" + digest


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def fetch_roles(session_key):
    data = rest_get(session_key, "/services/authorization/roles?output_mode=json&count=0")
    return data.get("entry", [])


def fetch_authentication_conf(session_key):
    data = rest_get(session_key, "/servicesNS/-/-/configs/conf-authentication?output_mode=json&count=0")
    return data.get("entry", [])


def parse_identity_provider(auth_entries):
    """Return (auth_type, {strategy_name: {role_name: [group, ...]}})."""
    auth_type = "Splunk"
    role_maps = {}
    for entry in auth_entries:
        name = entry.get("name", "")
        content = entry.get("content", {})
        if name == "authentication":
            auth_type = content.get("authType") or "Splunk"
        elif name.startswith("roleMap_"):
            strategy = name[len("roleMap_"):]
            mapping = {}
            for key, value in content.items():
                if key.startswith("eai:") or key == "disabled" or not value:
                    continue
                # Semicolon-separated, not comma - an LDAP group is
                # routinely a full DN ("cn=foo,ou=groups,dc=example,dc=com")
                # that legitimately contains commas, so comma cannot be the
                # multi-group separator here.
                groups = [g.strip() for g in str(value).split(";") if g.strip()]
                if groups:
                    mapping[key] = groups
            if mapping:
                role_maps[strategy] = mapping
    return auth_type, role_maps


def group_node_type(strategy_name):
    return "saml_group" if strategy_name.strip().upper() == "SAML" else "ldap_group"


class RowWriter:
    def __init__(self, stream):
        self._writer = csv.DictWriter(stream, fieldnames=CSV_FIELDS, lineterminator="\n")
        self._writer.writeheader()
        self._timestamp = now_iso()

    def add(self, source_id, source_type, source_label, target_id, target_type, target_label,
            relationship_type, relationship_label, risk_score=20):
        eid = edge_id(source_id, target_id, relationship_type)
        self._writer.writerow({
            "edge_id": eid,
            "source_id": source_id,
            "source_type": source_type,
            "source_label": source_label,
            "target_id": target_id,
            "target_type": target_type,
            "target_label": target_label,
            "relationship_type": relationship_type,
            "relationship_label": relationship_label,
            "event_count": 1,
            "first_seen": self._timestamp,
            "last_seen": self._timestamp,
            "risk_score": risk_score,
            "source_index": OUTPUT_INDEX,
            "source_sourcetype": OUTPUT_SOURCETYPE,
            "evidence_reference": "",
        })


def collect(session_key, out):
    roles = fetch_roles(session_key)
    auth_entries = fetch_authentication_conf(session_key)
    auth_type, role_maps = parse_identity_provider(auth_entries)

    rows = RowWriter(out)

    for role_entry in roles:
        role_name = role_entry.get("name", "")
        if not role_name:
            continue
        role_id = safe_id(role_name, "role")
        content = role_entry.get("content", {})

        for capability in content.get("capabilities") or []:
            cap_id = safe_id(capability, "privilege")
            risk = 80 if capability in SENSITIVE_CAPABILITIES else 20
            rows.add(role_id, "role", role_name, cap_id, "privilege", capability,
                     "GRANTS", "Grants", risk_score=risk)

        for index_name in content.get("srchIndexesAllowed") or []:
            index_id = safe_id(index_name, "index")
            rows.add(role_id, "role", role_name, index_id, "index", index_name,
                     "CAN_SEARCH", "Can search")

        for imported_role in content.get("imported_roles") or []:
            imported_id = safe_id(imported_role, "role")
            rows.add(role_id, "role", role_name, imported_id, "role", imported_role,
                     "INHERITS_FROM", "Inherits from")

    for strategy_name, mapping in role_maps.items():
        node_type = group_node_type(strategy_name)
        idp_id = safe_id(strategy_name, "identity_provider")
        for role_name, groups in mapping.items():
            role_id = safe_id(role_name, "role")
            for group_name in groups:
                group_id = safe_id(group_name, node_type)
                rows.add(group_id, node_type, group_name, role_id, "role", role_name,
                         "HAS_ROLE", "Has role")
                rows.add(group_id, node_type, group_name, idp_id, "identity_provider", strategy_name,
                         "AUTHENTICATES_VIA", "Authenticates via")

    log("collected RBAC model: %d roles, authType=%s, %d group-mapped strategies"
        % (len(roles), auth_type, len(role_maps)))


def main():
    session_key = read_session_key()
    if not session_key:
        log("no session key on stdin - this script must be run as a Splunk scripted input "
            "with passAuth = splunk-system-user (see default/inputs.conf); exiting without output")
        return 1
    try:
        collect(session_key, sys.stdout)
    except urllib.error.HTTPError as exc:
        log("REST request failed: HTTP %s %s" % (exc.code, exc.reason))
        return 1
    except urllib.error.URLError as exc:
        log("REST request failed: %s" % exc.reason)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
