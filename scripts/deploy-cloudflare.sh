#!/usr/bin/env bash
# 一键：推 secrets（可选）+ build & deploy
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PUSH_SECRETS=1
if [[ "${1:-}" == "--skip-secrets" ]]; then
  PUSH_SECRETS=0
fi

if [[ "$PUSH_SECRETS" -eq 1 ]]; then
  bash "$ROOT/scripts/push-cf-secrets.sh"
fi

echo "==> pnpm deploy"
pnpm deploy

echo ""
echo "部署完成。把 scripts/neon-cloudflare.env 里的 APP_ORIGIN / BETTER_AUTH_URL"
echo "改成终端打印的 https://….workers.dev 后，再执行："
echo "  bash scripts/push-cf-secrets.sh"
