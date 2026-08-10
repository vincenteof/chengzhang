#!/usr/bin/env bash
# 把 scripts/neon-cloudflare.env 中的密钥推到 Cloudflare Worker secrets
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${NEON_ENV_FILE:-$ROOT/scripts/neon-cloudflare.env}"

cd "$ROOT"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "缺少 $ENV_FILE"
  echo "请先：cp scripts/neon-cloudflare.env.example scripts/neon-cloudflare.env 并填写"
  exit 1
fi

# shellcheck disable=SC1091
source "$ROOT/scripts/load-env.sh" "$ENV_FILE"

DB_URL="${CF_DATABASE_URL:-$DATABASE_URL}"
SESSION="${SESSION_SECRET:-$BETTER_AUTH_SECRET}"

if [[ -z "${DB_URL:-}" || -z "${BETTER_AUTH_SECRET:-}" ]]; then
  echo "DATABASE_URL（或 CF_DATABASE_URL）与 BETTER_AUTH_SECRET 不能为空"
  exit 1
fi

if [[ -z "${APP_ORIGIN:-}" || -z "${BETTER_AUTH_URL:-}" ]]; then
  echo "APP_ORIGIN 与 BETTER_AUTH_URL 不能为空"
  exit 1
fi

echo "==> 将写入 secrets（值不打印）"
echo "    DATABASE_URL      (from ${CF_DATABASE_URL:+CF_DATABASE_URL}${CF_DATABASE_URL:-DATABASE_URL})"
echo "    BETTER_AUTH_SECRET"
echo "    SESSION_SECRET"
echo "    APP_ORIGIN        = $APP_ORIGIN"
echo "    BETTER_AUTH_URL   = $BETTER_AUTH_URL"
echo ""

if [[ "$APP_ORIGIN" == *"localhost"* ]] || [[ "$BETTER_AUTH_URL" == *"localhost"* ]]; then
  echo "⚠️  APP_ORIGIN / BETTER_AUTH_URL 仍是 localhost。"
  echo "   线上登录会失败。请先改成 https://你的.workers.dev 再推。"
  echo "   例: https://chengzhang.<subdomain>.workers.dev （无末尾 /）"
  read -r -p "仍要用 localhost 推送？仅本地调试才选 y [y/N] " ans
  [[ "${ans:-}" == "y" || "${ans:-}" == "Y" ]] || exit 1
fi

if [[ "$APP_ORIGIN" != "$BETTER_AUTH_URL" ]]; then
  echo "⚠️  APP_ORIGIN 与 BETTER_AUTH_URL 不一致，建议改成完全相同。"
  read -r -p "仍要继续？[y/N] " ans
  [[ "${ans:-}" == "y" || "${ans:-}" == "Y" ]] || exit 1
fi

printf '%s' "$DB_URL" | pnpm exec wrangler secret put DATABASE_URL
printf '%s' "$BETTER_AUTH_SECRET" | pnpm exec wrangler secret put BETTER_AUTH_SECRET
printf '%s' "$SESSION" | pnpm exec wrangler secret put SESSION_SECRET
printf '%s' "$APP_ORIGIN" | pnpm exec wrangler secret put APP_ORIGIN
printf '%s' "$BETTER_AUTH_URL" | pnpm exec wrangler secret put BETTER_AUTH_URL

echo ""
echo "Secrets 已更新。"
echo "若尚未部署：pnpm deploy"
echo "若刚改成线上 URL：刷新浏览器再登录即可（一般无需立刻 redeploy）。"
