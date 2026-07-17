# Privacy

GraphLens does not send data anywhere outside of the Splunk deployment it
is installed in. It has no external network dependency, no third-party
analytics, and no telemetry service.

## What GraphLens stores and where

| Data | Where | Purpose | Retention |
|---|---|---|---|
| Search results (nodes/edges) currently on screen | Browser memory only (React state) | Render the graph | Cleared on page reload/reset; never persisted to disk unless the user explicitly exports |
| Curated node/edge metadata | `graphlens_nodes` / `graphlens_edges` KV Store collections | Enrich the graph with administrator-curated context | Until deleted by an administrator |
| Node/relationship type display config | `graphlens_node_types` / `graphlens_relationship_types` KV Store collections | Legend/colour/shape configuration | Until deleted by an administrator |
| Saved graph views | `graphlens_saved_views` KV Store collection | Let a user resume/share a graph layout | Until deleted by its owner or an administrator |
| Annotations | `graphlens_annotations` KV Store collection | User notes attached to a node/edge | Until deleted, or until the optional `expiry` field is reached and it is cleaned up |
| Audit trail | `graphlens_audit_log` KV Store collection | Operational health/troubleshooting (section "Audit logging" in SECURITY.md) | Recommend a periodic retention job (see ADMIN_GUIDE.md); not automatically purged by GraphLens itself |
| Administrator configuration | `graphlens_settings.conf` (`local/` override) | Graph limits, feature toggles, search defaults | Standard Splunk configuration lifecycle |

## Personal data

The only personal data GraphLens handles is:

- The Splunk **username** of the person taking an action, recorded in the
  audit log (`actor` field) and as the `owner`/`author` of saved views and
  annotations. This is the same username already visible throughout
  Splunk (search history, KV Store ownership, etc.) - GraphLens does not
  introduce a new identity system.
- Whatever fields your own indexed relationship data or evidence events
  contain (e.g. a `src_user` field). GraphLens does not decide what data
  your organisation indexes; it only visualises and searches within the
  access boundaries your Splunk roles already define. Follow your
  organisation's own data classification and retention policy for the
  indexes/sourcetypes you point GraphLens at.

GraphLens does not collect device fingerprints, does not set its own
cookies (only the Splunk session cookie already used by Splunk Web
applies), and does not use browser local storage for anything beyond
transient, explicitly-opt-in UI preferences if you enable that in a future
configuration (1.0.0 does not persist any graph state to local storage by
default).

## Data subject requests

Because all data lives in standard Splunk indexes and KV Store
collections, access/deletion requests are handled the same way as any
other Splunk data in your deployment - through your organisation's normal
Splunk data-retention and access-request process, using standard SPL
(`| delete`) or the KV Store REST API to remove specific records (e.g. a
specific user's saved views or annotations).

## Third parties

GraphLens bundles open-source client-side libraries (see THIRDPARTY.md).
None of them phone home or load remote resources at runtime in GraphLens's
packaged build.
