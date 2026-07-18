#!/usr/bin/env bash
# Run a local Splunk Enterprise container (via podman) for manual/live
# testing of the GraphLens app - the parts of TESTING.md that explicitly
# require a real Splunk instance (privilege-boundary checks, Mako template
# rendering, REST endpoint smoke tests) and cannot be covered by the Jest
# suites alone.
#
# Requires: podman, npm, curl. Not part of the packaged app (see
# DEVELOPMENT.md, "Removed from the production build") - this is dev
# tooling only.
#
# Usage:
#   scripts/run_splunk_podman.sh all           # start + index + data + app + test users
#   scripts/run_splunk_podman.sh start         # pull image, start container, wait for it
#   scripts/run_splunk_podman.sh build         # npm install + npm run package
#   scripts/run_splunk_podman.sh install-app   # build (if needed) + install into container
#   scripts/run_splunk_podman.sh create-index  # create graphlens_relationships index
#   scripts/run_splunk_podman.sh load-data     # upload sample_data/*.csv
#   scripts/run_splunk_podman.sh create-users  # provision graphlens_viewer/analyst/admin test users
#   scripts/run_splunk_podman.sh logs          # tail splunkd.log
#   scripts/run_splunk_podman.sh shell         # shell into the container
#   scripts/run_splunk_podman.sh status        # container + Splunk health
#   scripts/run_splunk_podman.sh stop          # stop (keeps container + data)
#   scripts/run_splunk_podman.sh clean         # stop and remove container + volume
#
# Config (env overrides):
#   SPLUNK_IMAGE   (default: docker.io/splunk/splunk:latest)
#   CONTAINER_NAME (default: graphlens-splunk)
#   WEB_PORT       (default: 8000)
#   MGMT_PORT      (default: 8089)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

SPLUNK_IMAGE="${SPLUNK_IMAGE:-docker.io/splunk/splunk:latest}"
CONTAINER_NAME="${CONTAINER_NAME:-graphlens-splunk}"
WEB_PORT="${WEB_PORT:-8000}"
MGMT_PORT="${MGMT_PORT:-8089}"
VOLUME_NAME="${CONTAINER_NAME}-var"
PASSWORD_FILE="$APP_DIR/scripts/.splunk_admin_password"

require() { command -v "$1" >/dev/null 2>&1 || { echo "error: '$1' is required but not found on PATH." >&2; exit 1; }; }

admin_password() {
  if [ ! -f "$PASSWORD_FILE" ]; then
    # Splunk's default password policy requires >=8 chars; mix classes to
    # satisfy any stricter policy an admin may have enabled too.
    printf 'Gl%s!9x\n' "$(head -c9 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c9)" > "$PASSWORD_FILE"
    chmod 600 "$PASSWORD_FILE"
  fi
  cat "$PASSWORD_FILE"
}

curl_splunk() {
  local pass; pass="$(admin_password)"
  curl -sk -u "admin:${pass}" "https://localhost:${MGMT_PORT}$@"
}

wait_for_splunk() {
  echo "Waiting for splunkd management port to answer (this can take a minute or two on first start)..."
  local tries=0
  until curl_splunk "/services/server/info" 2>/dev/null | grep -q "generation"; do
    tries=$((tries + 1))
    if [ "$tries" -gt 90 ]; then
      echo "error: Splunk did not come up in time. Check logs: $0 logs" >&2
      exit 1
    fi
    sleep 5
  done
  echo "Splunk is up."
}

cmd_start() {
  require podman
  local pass; pass="$(admin_password)"
  if podman container exists "$CONTAINER_NAME"; then
    echo "Container '$CONTAINER_NAME' already exists; starting it."
    podman start "$CONTAINER_NAME" >/dev/null
  else
    echo "Pulling $SPLUNK_IMAGE ..."
    podman pull "$SPLUNK_IMAGE"
    echo "Starting $CONTAINER_NAME (web=$WEB_PORT mgmt=$MGMT_PORT) ..."
    podman run -d --name "$CONTAINER_NAME" \
      -p "${WEB_PORT}:8000" -p "${MGMT_PORT}:8089" \
      -e SPLUNK_START_ARGS='--accept-license' \
      -e SPLUNK_PASSWORD="$pass" \
      -v "${VOLUME_NAME}:/opt/splunk/var" \
      "$SPLUNK_IMAGE" >/dev/null
  fi
  wait_for_splunk
  echo
  echo "Splunk Web:  http://localhost:${WEB_PORT}  (login: admin / $(admin_password))"
  echo "Management:  https://localhost:${MGMT_PORT}"
}

cmd_build() {
  require npm
  echo "Building GraphLens package (npm install + npm run package) ..."
  npm install --no-audit --no-fund
  npm run package
}

cmd_create_index() {
  echo "Creating index 'graphlens_relationships' (see scripts/indexes.conf.example) ..."
  curl_splunk "/services/data/indexes" -d name=graphlens_relationships >/dev/null || true
  echo "Done (a 'already exists' response is fine on repeat runs)."
}

cmd_load_data() {
  local rel_csv="sample_data/graphlens_relationships_sample.csv"
  local evid_csv="sample_data/graphlens_evidence_sample.csv"
  [ -f "$rel_csv" ] || { echo "error: $rel_csv not found." >&2; exit 1; }
  echo "Copying sample data into the container ..."
  podman cp "$rel_csv" "$CONTAINER_NAME:/tmp/graphlens_relationships_sample.csv"
  podman cp "$evid_csv" "$CONTAINER_NAME:/tmp/graphlens_evidence_sample.csv"
  local pass; pass="$(admin_password)"
  echo "Loading relationship rows into index=graphlens_relationships sourcetype=graphlens:relationship ..."
  podman exec "$CONTAINER_NAME" /opt/splunk/bin/splunk add oneshot \
    /tmp/graphlens_relationships_sample.csv -index graphlens_relationships \
    -sourcetype "graphlens:relationship" -auth "admin:${pass}"
  echo "Loading evidence rows into index=main sourcetype=graphlens:evidence_demo (demo only - see DATA_MODEL.md for how evidence_reference wiring works in a real deployment) ..."
  podman exec "$CONTAINER_NAME" /opt/splunk/bin/splunk add oneshot \
    /tmp/graphlens_evidence_sample.csv -index main \
    -sourcetype "graphlens:evidence_demo" -auth "admin:${pass}"
}

cmd_install_app() {
  if [ ! -f "$APP_DIR/appserver/static/build/"*.js ] 2>/dev/null || [ "${FORCE_BUILD:-0}" = "1" ]; then
    cmd_build
  fi
  local version; version="$(python3 -c "import json; print(json.load(open('app.manifest'))['info']['id']['version'])")"
  local archive="dist/graphlens-${version}.tar.gz"
  [ -f "$archive" ] || cmd_build
  [ -f "$archive" ] || { echo "error: $archive not found after build." >&2; exit 1; }
  local pass; pass="$(admin_password)"
  echo "Copying $archive into the container ..."
  podman cp "$archive" "$CONTAINER_NAME:/tmp/graphlens.tar.gz"
  echo "Installing app ..."
  podman exec "$CONTAINER_NAME" /opt/splunk/bin/splunk install app \
    /tmp/graphlens.tar.gz -update 1 -auth "admin:${pass}"
  echo "Restarting Splunk to fully load the app ..."
  podman exec "$CONTAINER_NAME" /opt/splunk/bin/splunk restart -auth "admin:${pass}"
  wait_for_splunk
  echo "Installed. Open http://localhost:${WEB_PORT} and check apps/graphlens."
}

cmd_create_users() {
  # Provisions the three example roles from authorize.conf so the
  # privilege-boundary checks in TESTING.md can be run by hand:
  #   - graphlens_viewer:  graphlens_run_search only
  #   - graphlens_analyst: viewer + write access (importRoles role_graphlens_viewer)
  #   - graphlens_admin:   graphlens_manage_config
  local pass; pass="$(admin_password)"
  for role in graphlens_viewer graphlens_analyst graphlens_admin; do
    local user="test_${role}"
    echo "Creating user '$user' with role '$role' (password same as admin password) ..."
    podman exec "$CONTAINER_NAME" /opt/splunk/bin/splunk add user "$user" \
      -password "$pass" -role "$role" -auth "admin:${pass}" || \
      echo "  (already exists, skipping)"
  done
  echo
  echo "Test users ready - password for all: $(admin_password)"
  echo "  test_graphlens_viewer   -> confirm read-only access, no Configuration page writes"
  echo "  test_graphlens_analyst  -> confirm curated node/annotation writes work"
  echo "  test_graphlens_admin    -> confirm Configuration/Health pages and KV Store config writes work"
}

cmd_all() {
  cmd_start
  cmd_create_index
  cmd_load_data
  cmd_install_app
  cmd_create_users
  echo
  echo "=== Ready ==="
  echo "Splunk Web:  http://localhost:${WEB_PORT}  (admin / $(admin_password))"
  echo "Next: walk the live-instance checklist in TESTING.md (privilege-boundary"
  echo "tests, the three GraphLens views, and the performance-scale scenarios)."
}

cmd_logs()   { podman logs -f "$CONTAINER_NAME"; }
cmd_shell()  { podman exec -it "$CONTAINER_NAME" /bin/bash; }
cmd_status() {
  podman ps -a --filter "name=${CONTAINER_NAME}"
  curl_splunk "/services/server/info" 2>/dev/null | grep -o '"generation":[0-9]*' && echo "splunkd: up" || echo "splunkd: not responding"
}
cmd_stop()   { podman stop "$CONTAINER_NAME"; }
cmd_clean()  {
  podman rm -f "$CONTAINER_NAME" 2>/dev/null || true
  podman volume rm -f "$VOLUME_NAME" 2>/dev/null || true
  rm -f "$PASSWORD_FILE"
  echo "Removed container, volume, and saved admin password."
}

case "${1:-}" in
  all)          cmd_all ;;
  start)        cmd_start ;;
  build)        cmd_build ;;
  install-app)  cmd_install_app ;;
  create-index) cmd_create_index ;;
  load-data)    cmd_load_data ;;
  create-users) cmd_create_users ;;
  logs)         cmd_logs ;;
  shell)        cmd_shell ;;
  status)       cmd_status ;;
  stop)         cmd_stop ;;
  clean)        cmd_clean ;;
  *)
    sed -n '2,29p' "$0"
    exit 1
    ;;
esac
