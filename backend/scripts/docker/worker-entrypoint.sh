#!/usr/bin/env bash
# Bring up clamd + freshclam alongside the Nest worker. Both daemons are
# pinned to the foreground for the duration of the container's lifetime.
set -euo pipefail

# Refresh definitions on container start so a long-lived image still picks up
# the latest signatures; freshclam later runs every 12h via its own daemon.
freshclam --foreground --quiet || echo "freshclam: initial refresh skipped (will retry via daemon)"

# Background daemons. clamd listens on the TCP port configured in clamd.conf;
# we patch the config to bind on $CLAMD_HOST:$CLAMD_PORT if those are set.
if [[ -n "${CLAMD_PORT:-}" ]]; then
  sed -i \
    -e 's|^#*TCPSocket .*|TCPSocket '"${CLAMD_PORT}"'|' \
    -e 's|^#*TCPAddr .*|TCPAddr '"${CLAMD_HOST:-127.0.0.1}"'|' \
    /etc/clamav/clamd.conf
fi
clamd &
clamd_pid=$!
freshclam -d &
freshclam_pid=$!

trap 'kill $clamd_pid $freshclam_pid 2>/dev/null || true' EXIT

# Wait for clamd to start accepting connections.
for _ in $(seq 1 30); do
  if nc -z "${CLAMD_HOST:-127.0.0.1}" "${CLAMD_PORT:-3310}" 2>/dev/null; then
    break
  fi
  sleep 1
done

# Finally exec the Nest worker as PID 1's child.
exec "$@"
