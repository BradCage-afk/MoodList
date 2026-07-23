#!/bin/bash
# Finish the Moodlist index after a Spotify extended rate ban lifts.
# Launch detached:  setsid nohup bash scripts/indexer/overnight-resume.sh <sleep-seconds> &
# Every step is idempotent — safe to rerun.
cd "$(dirname "$0")/../.." || exit 1
LOG=${LOG:-$HOME/moodlist-overnight.log}
exec >> "$LOG" 2>&1

SLEEP=${1:-0}
echo "=== overnight resume: sleeping ${SLEEP}s until ban lifts ($(date)) ==="
sleep "$SLEEP"

count() {
  node -e "
require('dotenv').config({ path: '.env.local', quiet: true });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
pool.query(\"$1\").then(r => { process.stdout.write(String(r.rows[0].n)); process.exit(0); }).catch(() => { process.stdout.write('ERR'); process.exit(1); });
" 2>/dev/null
}

echo "--- collection ($(date)) ---"
for pass in $(seq 1 24); do
  npx tsx scripts/indexer/03-collect.ts --pages=20
  left=$(count "SELECT count(*)::int n FROM sources WHERE status='approved'")
  echo "collect pass $pass: $left sources left ($(date))"
  [ "$left" = "0" ] && break
  sleep 900 # lingering ban → don't spin
done

echo "--- rescore ($(date)) ---"
node -e "
require('dotenv').config({ path: '.env.local', quiet: true });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
pool.query(\"UPDATE tracks SET status='collected' WHERE confidence_source IN ('aggregated','pending') AND status <> 'collected'\").then(r => { console.log('reset for rescore:', r.rowCount); process.exit(0); });
" 2>/dev/null
npx tsx scripts/indexer/04-score.ts

echo "--- escalation ($(date)) ---"
for pass in $(seq 1 60); do
  npx tsx scripts/indexer/05-escalate.ts
  esc=$(count "SELECT count(*)::int n FROM tracks WHERE status='needs_escalation'")
  echo "escalate pass $pass: $esc tracks left ($(date))"
  [ "$esc" = "0" ] && break
done

echo "--- summary ($(date)) ---"
npx tsx scripts/indexer/06-summary.ts
echo "=== overnight run DONE ($(date)) ==="
