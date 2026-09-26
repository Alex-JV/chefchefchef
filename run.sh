#!/usr/bin/env bash
# Lance l'app en local sur http://localhost:3001
# Sans Supabase configuré dans app/config.js, l'app tourne en mode démo (données locales).
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js est nécessaire (https://nodejs.org)." >&2
  exit 1
fi
PORT="${PORT:-3001}" exec node scripts/serve.mjs
