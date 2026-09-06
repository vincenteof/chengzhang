#!/bin/sh
# Restart Compose in the persistent homelab checkout.
# Intended for the GitHub Actions self-hosted runner (and manual use).
set -eu

DEPLOY_DIR="${DEPLOY_DIR:-$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)}"
cd "$DEPLOY_DIR"

if [ ! -f .env ]; then
  echo "missing $DEPLOY_DIR/.env (copy from .env.example)" >&2
  exit 1
fi

echo "chengzhang: compose up in $DEPLOY_DIR"
docker compose up --build -d

echo "chengzhang: waiting for /api/health"
i=0
while [ "$i" -lt 45 ]; do
  if docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    echo "chengzhang: healthy"
    exit 0
  fi
  i=$((i + 1))
  sleep 2
done

echo "chengzhang: health check timed out" >&2
docker compose ps >&2
exit 1
