#!/usr/bin/env bash
# Deploy the COMMITTED tree to Cloudflare Pages (production).
#
# The Pages project is a direct-upload project (no Git connection), so pushing
# to main does not deploy. This is the deploy. It exports HEAD with git archive,
# so untracked files (node_modules, test-results) can never ship, refuses to
# upload an empty or incomplete export, and then checks the live site.
#
#   ALLOW_DEPLOY=1 npm run deploy        # deploys HEAD; tracked files must be clean
#   ALLOW_DEPLOY=1 bash scripts/deploy.sh <sha>   # deploys that commit
set -euo pipefail

PROJECT=neft-family-fluency
LIVE=https://neft-family-fluency.pages.dev

[ "${ALLOW_DEPLOY:-}" = 1 ] || { echo "Production deploy: set ALLOW_DEPLOY=1." >&2; exit 1; }
if [ -z "${1:-}" ]; then
  [ -z "$(git status --porcelain --untracked-files=no)" ] || {
    echo "Uncommitted changes to tracked files; commit first so what ships is what is in git." >&2
    exit 1
  }
fi

sha=$(git rev-parse --short "${1:-HEAD}")
[ -n "$sha" ] || { echo "Could not read HEAD." >&2; exit 1; }

dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT
git archive "$sha" | tar -x -C "$dir"

for f in index.html sw.js config.js curriculum/index.json curriculum/standards.json; do
  [ -s "$dir/$f" ] || { echo "Export is missing $f; refusing to deploy." >&2; exit 1; }
done

want=$(grep -o "CACHE_VERSION = '[^']*'" "$dir/sw.js")

(cd "$dir" && npx wrangler pages deploy . --project-name "$PROJECT" --branch main \
  --commit-hash "$sha" --commit-message "deploy $sha")

for _ in 1 2 3 4 5 6; do
  got=$(curl -fsS "$LIVE/sw.js?t=$(date +%s)" | grep -o "CACHE_VERSION = '[^']*'" || true)
  [ "$got" = "$want" ] && { echo "Live: $got ($sha)"; exit 0; }
  sleep 5
done
echo "Deployed, but $LIVE still serves '${got:-nothing}', expected '$want'." >&2
exit 1
