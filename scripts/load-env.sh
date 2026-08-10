# shellcheck shell=bash
# Usage: source scripts/load-env.sh path/to/file.env
# Safely exports KEY=value pairs (handles &, spaces, quotes in values).
# Does not override variables already set in the environment.

_load_env_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "env file not found: $file" >&2
    return 1
  fi
  # shellcheck disable=SC1090
  eval "$(
    node --input-type=module -e '
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
const file = process.argv[1];
const parsed = parse(readFileSync(file, "utf8"));
for (const [key, value] of Object.entries(parsed)) {
  if (process.env[key] !== undefined) continue;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
  console.log(`export ${key}=${JSON.stringify(value)}`);
}
' "$file"
  )"
}

_load_env_file "$1"
