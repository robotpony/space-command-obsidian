#!/usr/bin/env bash
# Packages the plugin as a release zip for space-command.ca.
#
#   scripts/package.sh [-o DIR] [--allow-dirty] [--skip-tests]
#   npm run package -- [options]
#
# Builds and tests, then writes <DIR>/space-command-obsidian-<version>.zip
# (default DIR: dist/) holding one folder named for the plugin id, with
# main.js, manifest.json and styles.css: unzip it into
# <vault>/.obsidian/plugins/ and it's installed. A .sha256 file is written
# beside it.
#
# Refuses when manifest.json and package.json disagree on the version, or
# when plugin source has uncommitted changes (another session's work in
# progress shouldn't ship); --allow-dirty overrides the second.
#
# The last line of output is the zip's absolute path, so a caller can
# capture it: zip=$(scripts/package.sh | tail -1)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/dist"
ALLOW_DIRTY=false
SKIP_TESTS=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        -o|--out) OUT_DIR="$2"; shift 2 ;;
        --allow-dirty) ALLOW_DIRTY=true; shift ;;
        --skip-tests) SKIP_TESTS=true; shift ;;
        -h|--help) sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "Unknown option: $1 (try --help)" >&2; exit 2 ;;
    esac
done

cd "$ROOT"

json_field() {
    node -p "require('./$1').$2"
}

PLUGIN_ID=$(json_field manifest.json id)
VERSION=$(json_field manifest.json version)
PKG_VERSION=$(json_field package.json version)

if [[ "$VERSION" != "$PKG_VERSION" ]]; then
    echo "manifest.json is $VERSION but package.json is $PKG_VERSION. Bump both to the same version." >&2
    exit 1
fi

if ! $ALLOW_DIRTY; then
    dirty=$(git status --porcelain -- src main.ts styles.css manifest.json package.json esbuild.config.mjs 2>/dev/null || true)
    if [[ -n "$dirty" ]]; then
        echo "Plugin source has uncommitted changes:" >&2
        echo "$dirty" >&2
        echo "Commit them first, or pass --allow-dirty." >&2
        exit 1
    fi
fi

echo "Packaging $PLUGIN_ID $VERSION" >&2

npm run build >&2
if ! $SKIP_TESTS; then
    npm test >&2
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/$PLUGIN_ID"
cp main.js manifest.json styles.css "$STAGE/$PLUGIN_ID/"

mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"
ZIP="$OUT_DIR/space-command-obsidian-$VERSION.zip"
rm -f "$ZIP"
# -X drops macOS extra attributes, so the zip has only the three files.
(cd "$STAGE" && zip -qrX "$ZIP" "$PLUGIN_ID")
(cd "$OUT_DIR" && shasum -a 256 "$(basename "$ZIP")" > "$(basename "$ZIP").sha256")

echo "Wrote $(unzip -Z1 "$ZIP" | grep -vc '/$') files, sha256 $(cut -d' ' -f1 "$ZIP.sha256")" >&2
echo "$ZIP"
