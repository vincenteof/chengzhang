#!/bin/sh
set -eu

MEDIA_DIR="${MEDIA_DIR:-/data/media}"
mkdir -p "$MEDIA_DIR"

echo "chengzhang: applying database migrations"
pnpm db:migrate
pnpm auth:migrate

echo "chengzhang: starting"
exec node .output/server/index.mjs
