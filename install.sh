#!/bin/bash
# Spark installer — downloads the latest release and installs it into
# /Applications without the com.apple.quarantine attribute, so the app
# opens with a plain double-click (no Gatekeeper dialogs).
#
#   curl -fsSL https://raw.githubusercontent.com/Oviing/Markdown/main/install.sh | bash
#
# Re-running it updates Spark to the latest release.
set -euo pipefail

REPO="Oviing/Markdown"
APP="Spark.app"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "error: Spark is a macOS app; this installer only runs on macOS." >&2
  exit 1
fi

echo "Looking up the latest Spark release..."
# Stock macOS has no jq, so pull the first zip asset URL out of the JSON by hand.
zip_url=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" |
  grep -o '"browser_download_url": *"[^"]*\.zip"' |
  head -n1 | sed 's/.*"\(https[^"]*\)"/\1/')

if [[ -z "$zip_url" ]]; then
  echo "error: could not find a .zip asset on the latest release of $REPO." >&2
  exit 1
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo "Downloading ${zip_url##*/}..."
curl -fL --progress-bar "$zip_url" -o "$tmp/spark.zip"

# ditto is the native archiver and reassembles the .app bundle correctly.
ditto -x -k "$tmp/spark.zip" "$tmp/unzipped"
app_path=$(find "$tmp/unzipped" -maxdepth 2 -name "$APP" -print -quit)
if [[ -z "$app_path" ]]; then
  echo "error: $APP not found inside the downloaded zip." >&2
  exit 1
fi

dest="/Applications"
if [[ ! -w "$dest" ]]; then
  dest="$HOME/Applications"
  mkdir -p "$dest"
  echo "note: /Applications is not writable; installing to $dest instead."
fi

# Replace any existing install (quit Spark first so the bundle isn't in use).
osascript -e 'quit app "Spark"' >/dev/null 2>&1 || true
rm -rf "${dest:?}/$APP"
mv "$app_path" "$dest/$APP"

# curl downloads carry no quarantine flag, but strip defensively in case the
# zip was produced or touched by something that added one.
xattr -dr com.apple.quarantine "$dest/$APP" 2>/dev/null || true

version=$(defaults read "$dest/$APP/Contents/Info" CFBundleShortVersionString 2>/dev/null || echo "")
echo "Installed Spark${version:+ $version} → $dest/$APP"
echo "Open it from ${dest/#$HOME/~} — no Gatekeeper dialog should appear."
