#!/usr/bin/env bash
# 用 scripts/neon-cloudflare.env 初始化 Neon（migrate + auth + seed + verify）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${NEON_ENV_FILE:-$ROOT/scripts/neon-cloudflare.env}"

cd "$ROOT"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "缺少 $ENV_FILE"
  echo "请先：cp scripts/neon-cloudflare.env.example scripts/neon-cloudflare.env"
  echo "再编辑其中的 DATABASE_URL / AUTH_* / BETTER_AUTH_SECRET"
  exit 1
fi

# shellcheck disable=SC1091
source "$ROOT/scripts/load-env.sh" "$ENV_FILE"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL 为空，请编辑 $ENV_FILE"
  exit 1
fi

if [[ "$DATABASE_URL" == *"pooler"* ]]; then
  echo "警告: DATABASE_URL 含 pooler。db:setup 请改用 Neon Direct（无 -pooler）。"
  echo "继续可能出现 Connection terminated unexpectedly。"
  read -r -p "仍要继续？[y/N] " ans
  [[ "${ans:-}" == "y" || "${ans:-}" == "Y" ]] || exit 1
fi

if [[ "$DATABASE_URL" != *"sslmode="* ]]; then
  echo "提示: 建议在 DATABASE_URL 中加 sslmode=require"
fi

for key in AUTH_ALLOWED_EMAIL AUTH_PASSWORD BETTER_AUTH_SECRET; do
  if [[ -z "${!key:-}" || "${!key}" == replace-* || "${!key}" == change-me* ]]; then
    echo "请先在 $ENV_FILE 里改好 $key"
    exit 1
  fi
done

if [[ -z "${SESSION_SECRET:-}" ]]; then
  export SESSION_SECRET="$BETTER_AUTH_SECRET"
fi

echo "==> 测试数据库连接…"
node --input-type=module -e "
import pg from 'pg';
const url = process.env.DATABASE_URL;
const host = url.match(/@([^/]+)/)?.[1] ?? '?';
console.log('host:', host);
const pool = new pg.Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 20000 });
const r = await pool.query('select 1 as ok, current_database() as db');
console.log('ok:', r.rows[0]);
await pool.end();
"

echo "==> pnpm db:migrate"
pnpm db:migrate

echo "==> pnpm auth:migrate"
pnpm auth:migrate

echo "==> pnpm db:seed"
pnpm db:seed

echo "==> pnpm db:verify"
pnpm db:verify

echo ""
echo "Neon 初始化完成。"
echo "下一步："
echo "  1) pnpm exec wrangler login"
echo "  2) pnpm cf:secrets"
echo "  3) pnpm deploy"
echo "  4) 把 $ENV_FILE 里 APP_ORIGIN / BETTER_AUTH_URL 改成 https://你的.workers.dev"
echo "  5) 再跑一遍 pnpm cf:secrets"
