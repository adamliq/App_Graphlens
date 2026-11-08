#!/usr/bin/env python3
"""Unit tests for the pure logic in bin/graphlens_rbac_collector.py.

These cover everything that doesn't require a running Splunk instance
(identifier sanitisation, deterministic edge-id derivation, and parsing
authentication.conf's REST representation). The REST-calling and
stdin-session-key parts were instead exercised directly against a live
Splunk Enterprise 10.6.1 (build 1) instance during development - see
DEVELOPMENT.md and RBAC_MODEL.md - because mocking Splunk's own REST
response shape would only test assumptions about that shape, not whether
they're correct.

Not part of `npm test` (this is Python, not Jest) - run directly:

    python3 tests/python/test_rbac_collector.py
"""
import os
import re
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "bin"))
import graphlens_rbac_collector as collector  # noqa: E402

ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9:_\-.@/]{0,254}$")


class SafeIdTests(unittest.TestCase):
    def test_well_formed_name_is_unchanged(self):
        self.assertEqual(collector.safe_id("power", "role"), "role:power")
        self.assertEqual(collector.safe_id("admin_all_objects", "privilege"),
                          "privilege:admin_all_objects")

    def test_literal_wildcard_index(self):
        self.assertEqual(collector.safe_id("*", "index"), "index:all-indexes")

    def test_non_index_wildcard_is_still_valid(self):
        result = collector.safe_id("*", "role")
        self.assertTrue(ID_PATTERN.match(result))

    def test_leading_underscore_is_satisfied_by_prefix(self):
        result = collector.safe_id("_internal", "index")
        self.assertTrue(ID_PATTERN.match(result))
        self.assertTrue(result.startswith("index:x_internal-"))

    def test_ldap_dn_is_sanitised_and_deterministic(self):
        raw = "cn=domain-admins,ou=groups,dc=example,dc=com"
        first = collector.safe_id(raw, "ldap_group")
        second = collector.safe_id(raw, "ldap_group")
        self.assertTrue(ID_PATTERN.match(first))
        self.assertEqual(first, second)

    def test_different_raw_names_never_collide(self):
        a = collector.safe_id("Group A!!!", "saml_group")
        b = collector.safe_id("Group A???", "saml_group")
        self.assertNotEqual(a, b)

    def test_empty_name_is_handled(self):
        result = collector.safe_id("", "role")
        self.assertTrue(ID_PATTERN.match(result))

    def test_result_never_exceeds_max_length(self):
        result = collector.safe_id("x" * 1000, "role")
        self.assertLessEqual(len(result), 255)
        self.assertTrue(ID_PATTERN.match(result))


class EdgeIdTests(unittest.TestCase):
    def test_deterministic_across_calls(self):
        first = collector.edge_id("role:admin", "privilege:admin_all_objects", "GRANTS")
        second = collector.edge_id("role:admin", "privilege:admin_all_objects", "GRANTS")
        self.assertEqual(first, second)

    def test_differs_by_relationship_type(self):
        a = collector.edge_id("role:admin", "index:main", "CAN_SEARCH")
        b = collector.edge_id("role:admin", "index:main", "INHERITS_FROM")
        self.assertNotEqual(a, b)

    def test_starts_with_edge_prefix(self):
        self.assertTrue(collector.edge_id("a", "b", "c").startswith("edge:"))


class ParseIdentityProviderTests(unittest.TestCase):
    def test_native_splunk_auth_has_no_role_maps(self):
        entries = [{"name": "authentication", "content": {"authType": "Splunk"}}]
        auth_type, role_maps = collector.parse_identity_provider(entries)
        self.assertEqual(auth_type, "Splunk")
        self.assertEqual(role_maps, {})

    def test_defaults_to_splunk_when_authentication_stanza_absent(self):
        auth_type, role_maps = collector.parse_identity_provider([])
        self.assertEqual(auth_type, "Splunk")
        self.assertEqual(role_maps, {})

    def test_saml_role_map_semicolon_separated(self):
        entries = [
            {"name": "authentication", "content": {"authType": "SAML"}},
            {"name": "roleMap_SAML", "content": {
                "admin": "domain-admins;splunk-admins",
                "eai:acl": {"owner": "nobody"},
            }},
        ]
        auth_type, role_maps = collector.parse_identity_provider(entries)
        self.assertEqual(auth_type, "SAML")
        self.assertEqual(role_maps["SAML"]["admin"], ["domain-admins", "splunk-admins"])
        self.assertNotIn("eai:acl", role_maps["SAML"])

    def test_ldap_role_map_semicolon_separated_dns_keep_internal_commas(self):
        entries = [
            {"name": "authentication", "content": {"authType": "LDAP"}},
            {"name": "roleMap_CorpLDAP", "content": {
                "power": "cn=power-users,ou=groups,dc=example,dc=com;cn=other-group,ou=groups,dc=example,dc=com",
            }},
        ]
        _, role_maps = collector.parse_identity_provider(entries)
        groups = role_maps["CorpLDAP"]["power"]
        self.assertEqual(len(groups), 2)
        self.assertEqual(groups[0], "cn=power-users,ou=groups,dc=example,dc=com")
        self.assertEqual(groups[1], "cn=other-group,ou=groups,dc=example,dc=com")

    def test_disabled_and_empty_values_are_skipped(self):
        entries = [
            {"name": "roleMap_SAML", "content": {"disabled": False, "user": ""}},
        ]
        _, role_maps = collector.parse_identity_provider(entries)
        self.assertEqual(role_maps, {})


class GroupNodeTypeTests(unittest.TestCase):
    def test_saml_strategy_name_case_insensitive(self):
        self.assertEqual(collector.group_node_type("SAML"), "saml_group")
        self.assertEqual(collector.group_node_type("saml"), "saml_group")

    def test_any_other_strategy_name_is_ldap(self):
        self.assertEqual(collector.group_node_type("CorpLDAP"), "ldap_group")
        self.assertEqual(collector.group_node_type("OktaLDAP"), "ldap_group")


if __name__ == "__main__":
    unittest.main()
