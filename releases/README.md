# Releases

The built, installable Splunk app package for the current version,
committed to the repo so it doesn't need to be built from source to
install or evaluate GraphLens.

- `graphlens-<version>.spl` - the distributable app package (identical
  format to the `.tar.gz` `scripts/package_app.sh` produces - Splunk Web's
  "Install App from File" and the `splunk install app` CLI both accept
  `.spl` directly).
- `graphlens-<version>.spl.sha256` - its SHA-256 checksum.

## Regenerating

After any change that lands on `main`, rebuild and replace the file here
so it stays in sync with the version in `app.manifest`:

```bash
cd graphlens
npm run build
bash scripts/package_app.sh
cp dist/graphlens-<version>.tar.gz ../releases/graphlens-<version>.spl
cd ../releases
sha256sum graphlens-<version>.spl > graphlens-<version>.spl.sha256
rm -f graphlens-<old-version>.spl graphlens-<old-version>.spl.sha256
```

Keep only the current version's files here - this directory is not a
version archive; see CHANGELOG.md for release history.
