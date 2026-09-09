#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
for tool in orca xvfb-run dbus-run-session xdotool; do
  if ! command -v "$tool" >/dev/null; then
    echo "Missing $tool. On Ubuntu: sudo apt install orca xvfb xauth dbus-x11 xdotool" >&2
    exit 2
  fi
done
# A private X display and D-Bus session keep keystrokes away from the user's desktop.
# Memory-backed settings prevent the test from changing desktop accessibility settings.
export GSETTINGS_BACKEND=memory
export GIO_USE_VFS=local
export GTK_USE_PORTAL=0
export XDG_CURRENT_DESKTOP=AccessibilityTest
export NO_AT_BRIDGE=0
export A11Y_ORCA=1
exec xvfb-run -a -s '-screen 0 1440x1000x24 -nolisten tcp' dbus-run-session -- node scripts/accessibility/audit.mjs
