#!/usr/bin/env bash
# Run from repo root after: npx @railway/cli@latest login
# and: npx @railway/cli@latest link  (select project + PodSignal service)
#
# Sets ENCRYPTION_KEY (new 64-hex). Optionally sets ANTHROPIC_API_KEY if it is
# already exported in your shell. DATABASE_URL / REDIS_URL must reference your
# Railway Postgres + Redis (use Dashboard → Variables → "Reference", or paste URLs).

set -euo pipefail
cd "$(dirname "$0")/.."

CLI=(npx --yes @railway/cli@latest)

if ! "${CLI[@]}" whoami 2>/dev/null; then
  echo ""
  echo "Not logged in. Run:"
  echo "  npx @railway/cli@latest login"
  exit 1
fi

KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
echo ""
echo "Setting ENCRYPTION_KEY on the linked Railway service..."
"${CLI[@]}" variable set "ENCRYPTION_KEY=${KEY}"

if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "Setting ANTHROPIC_API_KEY from your shell..."
  "${CLI[@]}" variable set "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}"
else
  echo ""
  echo "Skip ANTHROPIC_API_KEY (not set in this shell). Set it with:"
  echo "  export ANTHROPIC_API_KEY='sk-ant-api03-...'"
  echo "  bash scripts/railway-env-setup.sh"
  echo "Or: npx @railway/cli@latest variable set 'ANTHROPIC_API_KEY=sk-ant-...'"
fi

echo ""
echo "─── Still required in Railway (same service) ───"
echo "1) DATABASE_URL  → Variable → Reference → your PostgreSQL plugin"
echo "2) REDIS_URL     → Variable → Reference → your Redis plugin"
echo "3) APP_URL       → https://<your-public-host> (HTTPS, no path)"
echo ""
echo "Then redeploy if the service does not restart automatically."
