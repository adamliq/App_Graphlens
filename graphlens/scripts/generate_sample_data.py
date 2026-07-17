#!/usr/bin/env python3
"""Generate synthetic GraphLens sample data.

Produces two files under sample_data/:
  - graphlens_relationships_sample.csv : rows matching the
    graphlens_relationships index schema (see DATA_MODEL.md), suitable for
    `| inputlookup` testing or a one-time `sourcetype=graphlens:relationship`
    upload via Splunk Web's "Add Data" for a demo/sandbox index.
  - graphlens_evidence_sample.csv : a handful of raw-looking supporting
    events referenced by evidence_reference, for evidence-drilldown demos.

All identifiers, hostnames, IP addresses and usernames are fictitious.
IP addresses are drawn only from IANA documentation ranges
(RFC 5737 / RFC 3849): 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24.

This script has no third-party dependencies and performs no network or
filesystem access outside of the sample_data/ directory next to it.
"""
import csv
import hashlib
import os
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(os.path.dirname(HERE), "sample_data")

NOW = datetime(2026, 7, 17, 8, 0, 0, tzinfo=timezone.utc)


def edge_id(source_id, target_id, relationship_type):
    digest = hashlib.sha256(f"{source_id}|{target_id}|{relationship_type}".encode("utf-8")).hexdigest()[:12]
    return f"edge:{digest}"


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


ROWS = []


def add(source_id, source_type, source_label, target_id, target_type, target_label,
        relationship_type, relationship_label, event_count, risk_score,
        source_index, source_sourcetype, days_ago_first=2, days_ago_last=0, evidence_key=None):
    first_seen = NOW - timedelta(days=days_ago_first)
    last_seen = NOW - timedelta(days=days_ago_last)
    eid = edge_id(source_id, target_id, relationship_type)
    ROWS.append({
        "edge_id": eid,
        "source_id": source_id,
        "source_type": source_type,
        "source_label": source_label,
        "target_id": target_id,
        "target_type": target_type,
        "target_label": target_label,
        "relationship_type": relationship_type,
        "relationship_label": relationship_label,
        "event_count": event_count,
        "first_seen": iso(first_seen),
        "last_seen": iso(last_seen),
        "risk_score": risk_score,
        "source_index": source_index,
        "source_sourcetype": source_sourcetype,
        "evidence_reference": evidence_key or eid,
    })


# 1. Security investigation chain.
add("alert:privileged_login_anomaly", "alert", "Privileged Login Anomaly",
    "user:jsmith", "user", "J Smith",
    "TRIGGERED", "Triggered", 3, 78, "graphlens_relationships", "graphlens:relationship")
add("user:jsmith", "user", "J Smith",
    "host:srv-app01.example.com", "host", "srv-app01.example.com",
    "AUTHENTICATED_TO", "Authenticated to", 12, 62, "graphlens_relationships", "graphlens:relationship")
add("host:srv-app01.example.com", "host", "srv-app01.example.com",
    "process:sha256:9f1c2e7a4b3d", "process", "powershell.exe",
    "RAN_PROCESS", "Ran process", 5, 70, "graphlens_relationships", "graphlens:relationship")
add("process:sha256:9f1c2e7a4b3d", "process", "powershell.exe",
    "ip:203.0.113.44", "ip", "203.0.113.44",
    "CONNECTED_TO", "Connected to", 8, 81, "graphlens_relationships", "graphlens:relationship")
add("ip:203.0.113.44", "ip", "203.0.113.44",
    "domain:updates.example-cdn.test", "domain", "updates.example-cdn.test",
    "RESOLVED_TO", "Resolved to", 4, 55, "graphlens_relationships", "graphlens:relationship")
add("domain:updates.example-cdn.test", "domain", "updates.example-cdn.test",
    "threat_indicator:ioc-8827", "threat_indicator", "IOC-8827",
    "ASSOCIATED_WITH_INDICATOR", "Associated with indicator", 1, 91, "graphlens_relationships", "graphlens:relationship")

# 2. Splunk knowledge-object lineage.
add("dashboard:security_posture", "dashboard", "Security Posture",
    "savedsearch:privileged_login", "savedsearch", "Privileged Login",
    "REFERENCES", "References", 1, 10, "graphlens_relationships", "graphlens:relationship")
add("savedsearch:privileged_login", "savedsearch", "Privileged Login",
    "macro:graphlens_valid_id", "macro", "graphlens_valid_id",
    "USES_MACRO", "Uses macro", 1, 5, "graphlens_relationships", "graphlens:relationship")
add("savedsearch:privileged_login", "savedsearch", "Privileged Login",
    "lookup:graphlens_node_types", "lookup", "graphlens_node_types",
    "USES_LOOKUP", "Uses lookup", 1, 5, "graphlens_relationships", "graphlens:relationship")
add("savedsearch:privileged_login", "savedsearch", "Privileged Login",
    "data_model:authentication", "data_model", "Authentication",
    "BUILT_FROM", "Built from", 1, 5, "graphlens_relationships", "graphlens:relationship")
add("data_model:authentication", "data_model", "Authentication",
    "sourcetype:XmlWinEventLog:Security", "sourcetype", "XmlWinEventLog:Security",
    "WRITES_TO_SOURCETYPE", "Writes to sourcetype", 1, 5, "graphlens_relationships", "graphlens:relationship")
add("sourcetype:XmlWinEventLog:Security", "sourcetype", "XmlWinEventLog:Security",
    "index:windows", "index", "windows",
    "STORED_IN_INDEX", "Stored in index", 1, 5, "graphlens_relationships", "graphlens:relationship")

# 3. Logging catalogue.
add("business_system:finance_platform", "business_system", "Finance Platform",
    "technology:windows_server", "technology", "Windows Server",
    "DEPENDS_ON", "Depends on", 1, 20, "graphlens_relationships", "graphlens:relationship")
add("technology:windows_server", "technology", "Windows Server",
    "log_source:xmlwineventlog_security", "log_source", "XmlWinEventLog Security",
    "GENERATES_LOG", "Generates log", 1, 15, "graphlens_relationships", "graphlens:relationship")
add("log_source:xmlwineventlog_security", "log_source", "XmlWinEventLog Security",
    "event_type:4624_logon", "event_type", "4624 Logon",
    "REFERENCES", "References", 1, 10, "graphlens_relationships", "graphlens:relationship")
add("event_type:4624_logon", "event_type", "4624 Logon",
    "required_field:src_user", "required_field", "src_user",
    "REFERENCES", "References", 1, 5, "graphlens_relationships", "graphlens:relationship")
add("event_type:4624_logon", "event_type", "4624 Logon",
    "detection_use_case:privileged_login_anomaly", "detection_use_case", "Privileged Login Anomaly",
    "SUPPORTS_DETECTION", "Supports detection", 1, 40, "graphlens_relationships", "graphlens:relationship")
add("detection_use_case:privileged_login_anomaly", "detection_use_case", "Privileged Login Anomaly",
    "mitre_technique:T1078", "mitre_technique", "T1078 Valid Accounts",
    "MAPS_TO_TECHNIQUE", "Maps to technique", 1, 45, "graphlens_relationships", "graphlens:relationship")

# 4. Application dependency mapping.
add("business_service:online_banking", "business_service", "Online Banking",
    "application:finance_system", "application", "Finance System",
    "DEPENDS_ON", "Depends on", 1, 30, "graphlens_relationships", "graphlens:relationship")
add("application:finance_system", "application", "Finance System",
    "server:srv-app01.example.com", "server", "srv-app01.example.com",
    "HOSTED_ON", "Hosted on", 1, 25, "graphlens_relationships", "graphlens:relationship")
add("server:srv-app01.example.com", "server", "srv-app01.example.com",
    "database:finance_db01", "database", "finance_db01",
    "USES_DATABASE", "Uses database", 1, 35, "graphlens_relationships", "graphlens:relationship")
add("application:finance_system", "application", "Finance System",
    "api:payments_api_v2", "api", "Payments API v2",
    "EXPOSES_API", "Exposes API", 1, 20, "graphlens_relationships", "graphlens:relationship")
add("application:finance_system", "application", "Finance System",
    "identity_provider:corp_sso", "identity_provider", "Corporate SSO",
    "AUTHENTICATES_VIA", "Authenticates via", 1, 15, "graphlens_relationships", "graphlens:relationship")
add("server:srv-app01.example.com", "server", "srv-app01.example.com",
    "cloud_subscription:sub-prod-001", "cloud_subscription", "sub-prod-001",
    "DEPLOYED_IN", "Deployed in", 1, 10, "graphlens_relationships", "graphlens:relationship")

# 5. Identity relationships.
add("user:jsmith", "user", "J Smith",
    "group:finance_admins", "group", "Finance Admins",
    "MEMBER_OF", "Member of", 1, 40, "graphlens_relationships", "graphlens:relationship")
add("group:finance_admins", "group", "Finance Admins",
    "role:finance_admin_role", "role", "Finance Admin Role",
    "HAS_ROLE", "Has role", 1, 40, "graphlens_relationships", "graphlens:relationship")
add("role:finance_admin_role", "role", "Finance Admin Role",
    "privilege:approve_wire_transfer", "privilege", "Approve Wire Transfer",
    "GRANTS", "Grants", 1, 60, "graphlens_relationships", "graphlens:relationship")
add("role:finance_admin_role", "role", "Finance Admin Role",
    "application:finance_system", "application", "Finance System",
    "GRANTS", "Grants", 1, 30, "graphlens_relationships", "graphlens:relationship")
add("user:jsmith", "user", "J Smith",
    "host:srv-app01.example.com", "host", "srv-app01.example.com",
    "OWNS", "Owns", 1, 20, "graphlens_relationships", "graphlens:relationship")

# A second, unrelated user/host pair so the sample graph is not a single
# connected component (exercises empty-state / search behaviour).
add("user:bjones", "user", "B Jones",
    "host:ws-1042.example.com", "host", "ws-1042.example.com",
    "AUTHENTICATED_TO", "Authenticated to", 6, 20, "graphlens_relationships", "graphlens:relationship")
add("user:bjones", "user", "B Jones",
    "ip:198.51.100.23", "ip", "198.51.100.23",
    "COMMUNICATED_WITH", "Communicated with", 3, 15, "graphlens_relationships", "graphlens:relationship")


def write_relationships():
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, "graphlens_relationships_sample.csv")
    fieldnames = ["edge_id", "source_id", "source_type", "source_label", "target_id", "target_type",
                  "target_label", "relationship_type", "relationship_label", "event_count", "first_seen",
                  "last_seen", "risk_score", "source_index", "source_sourcetype", "evidence_reference"]
    with open(path, "w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for row in ROWS:
            writer.writerow(row)
    return path


def write_evidence():
    path = os.path.join(OUT_DIR, "graphlens_evidence_sample.csv")
    fieldnames = ["_time", "evidence_reference", "src_user", "dest_host", "src_ip", "action", "raw"]
    sample_events = [
        {
            "_time": iso(NOW - timedelta(hours=3)),
            "evidence_reference": edge_id("user:jsmith", "host:srv-app01.example.com", "AUTHENTICATED_TO"),
            "src_user": "jsmith",
            "dest_host": "srv-app01.example.com",
            "src_ip": "192.0.2.10",
            "action": "success",
            "raw": "2026-07-17T05:00:00Z host=srv-app01.example.com src_user=jsmith src_ip=192.0.2.10 action=success signature=An account was successfully logged on",
        },
        {
            "_time": iso(NOW - timedelta(hours=5)),
            "evidence_reference": edge_id("process:sha256:9f1c2e7a4b3d", "ip:203.0.113.44", "CONNECTED_TO"),
            "src_user": "jsmith",
            "dest_host": "srv-app01.example.com",
            "src_ip": "192.0.2.10",
            "action": "network_connection",
            "raw": "2026-07-17T03:00:00Z host=srv-app01.example.com process=powershell.exe dest_ip=203.0.113.44 dest_port=443 action=allowed",
        },
    ]
    with open(path, "w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for row in sample_events:
            writer.writerow(row)
    return path


if __name__ == "__main__":
    rel_path = write_relationships()
    ev_path = write_evidence()
    print(f"Wrote {len(ROWS)} relationship rows to {rel_path}")
    print(f"Wrote evidence sample to {ev_path}")
