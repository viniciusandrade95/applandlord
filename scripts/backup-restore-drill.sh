#!/usr/bin/env bash
set -euo pipefail

WORKDIR="${1:-/tmp/applandlord-backup-drill}"
mkdir -p "$WORKDIR"

SNAPSHOT="$WORKDIR/snapshot.json"
BACKUP="$WORKDIR/snapshot.json.gz"
RESTORED="$WORKDIR/restored.json"

cat > "$SNAPSHOT" <<'JSON'
{
  "meta": {
    "capturedAt": "2026-04-18T12:00:00.000Z",
    "source": "operational-drill"
  },
  "tables": {
    "users": [{ "id": "u1", "email": "owner@example.com" }],
    "leases": [{ "id": "l1", "status": "Active" }],
    "invoices": [{ "id": "i1", "status": "Pending", "amount": 1200 }]
  }
}
JSON

gzip -c "$SNAPSHOT" > "$BACKUP"
gunzip -c "$BACKUP" > "$RESTORED"

ORIGINAL_SUM=$(sha256sum "$SNAPSHOT" | awk '{print $1}')
RESTORED_SUM=$(sha256sum "$RESTORED" | awk '{print $1}')

if [[ "$ORIGINAL_SUM" != "$RESTORED_SUM" ]]; then
  echo "Restore drill failed: checksum mismatch"
  exit 1
fi

echo "Restore drill OK"
echo "workdir=$WORKDIR"
echo "backup_file=$BACKUP"
echo "sha256=$ORIGINAL_SUM"
