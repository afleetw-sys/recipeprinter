#!/bin/sh
# Builds the iOS print harness for the Simulator and runs it on a booted device.
#
#   tools/ios-print-harness/run.sh <mode> <url> [--auto-dismiss <seconds>]
#
# Modes: firefox, duckduckgo, brave, chrome, google-app. Native logs ("HARNESS
# ...") stream to this terminal. Set HARNESS_DEVICE to a simulator UDID or name;
# default is the booted one. A page on this Mac is http://localhost:<port>.
set -eu

MODE="${1:?mode}"
URL="${2:?url}"
shift 2
DEVICE="${HARNESS_DEVICE:-booted}"
HERE="$(cd "$(dirname "$0")" && pwd)"
BUILD="${TMPDIR:-/tmp}/ios-print-harness"
APP="$BUILD/PrintHarness.app"
SDK="$(xcrun --sdk iphonesimulator --show-sdk-path)"
ARCH="$(uname -m)"

mkdir -p "$APP"
xcrun --sdk iphonesimulator swiftc -O \
  -sdk "$SDK" -target "$ARCH-apple-ios17.0-simulator" \
  "$HERE/main.swift" -o "$APP/PrintHarness"
cp "$HERE/Info.plist" "$APP/Info.plist"
codesign --force --sign - "$APP" >/dev/null 2>&1

xcrun simctl install "$DEVICE" "$APP"
xcrun simctl terminate "$DEVICE" com.recipeprinter.printharness >/dev/null 2>&1 || true
exec xcrun simctl launch --console "$DEVICE" com.recipeprinter.printharness \
  --mode "$MODE" --url "$URL" "$@"
