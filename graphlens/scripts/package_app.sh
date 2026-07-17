#!/usr/bin/env bash
# Package the GraphLens Splunk application into an installable archive.
#
# Produces dist/graphlens-<version>.tar.gz containing a single top-level
# "graphlens" folder with only the files Splunk needs at runtime -
# source (src/), tests, dev tooling and node_modules are deliberately
# excluded, per the packaging requirements in DEVELOPMENT.md and
# APPINSPECT.md. Run `npm run build` before this script (npm run package
# does both, in order).
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

VERSION="$(python3 -c "import json; print(json.load(open('app.manifest'))['info']['id']['version'])")"
DIST_DIR="$APP_DIR/dist"
STAGE_DIR="$DIST_DIR/graphlens"
ARCHIVE_NAME="graphlens-${VERSION}.tar.gz"

if [ ! -d "$APP_DIR/appserver/static/build" ] || [ -z "$(ls -A "$APP_DIR/appserver/static/build" 2>/dev/null)" ]; then
  echo "error: appserver/static/build is missing or empty - run 'npm run build' first." >&2
  exit 1
fi

rm -rf "$DIST_DIR"
mkdir -p "$STAGE_DIR"

# Runtime-required content only.
cp -R "$APP_DIR/app.manifest" "$STAGE_DIR/"
cp -R "$APP_DIR/default" "$STAGE_DIR/"
cp -R "$APP_DIR/metadata" "$STAGE_DIR/"
cp -R "$APP_DIR/static" "$STAGE_DIR/"
cp -R "$APP_DIR/lookups" "$STAGE_DIR/"
mkdir -p "$STAGE_DIR/appserver/static/build" "$STAGE_DIR/appserver/templates"
cp -R "$APP_DIR/appserver/static/build/." "$STAGE_DIR/appserver/static/build/"
cp -R "$APP_DIR/appserver/templates/." "$STAGE_DIR/appserver/templates/"

for doc in README.md LICENSE NOTICE THIRDPARTY.md CHANGELOG.md SUPPORT.md SECURITY.md \
           INSTALL.md CONFIGURATION.md USER_GUIDE.md ADMIN_GUIDE.md ARCHITECTURE.md \
           DATA_MODEL.md PRIVACY.md; do
  if [ -f "$APP_DIR/$doc" ]; then
    cp "$APP_DIR/$doc" "$STAGE_DIR/$doc"
  fi
done

# Strip any editor/OS junk that may have been copied in.
find "$STAGE_DIR" -name ".DS_Store" -delete
find "$STAGE_DIR" -name "Thumbs.db" -delete
find "$STAGE_DIR" -name "*.map" -delete

mkdir -p "$DIST_DIR"
tar -czf "$DIST_DIR/$ARCHIVE_NAME" -C "$DIST_DIR" graphlens

shasum -a 256 "$DIST_DIR/$ARCHIVE_NAME" > "$DIST_DIR/$ARCHIVE_NAME.sha256" 2>/dev/null \
  || sha256sum "$DIST_DIR/$ARCHIVE_NAME" > "$DIST_DIR/$ARCHIVE_NAME.sha256"

echo "Built $DIST_DIR/$ARCHIVE_NAME"
cat "$DIST_DIR/$ARCHIVE_NAME.sha256"
