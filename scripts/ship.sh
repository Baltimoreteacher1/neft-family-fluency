#!/usr/bin/env bash
# "Deploy live": run the unit tests, push HEAD to main, make sure it is deployed.
# Commit first; deploy.sh refuses a dirty tree.
#
# Once the repo has a CLOUDFLARE_API_TOKEN secret, the Deploy workflow does the
# upload on push, so this just pushes and watches it. Until then it uploads
# directly. One path runs per ship, never both.
#
#   npm run ship
set -euo pipefail

npm test --silent
git push origin HEAD:main

if gh secret list --json name --jq '.[].name' | grep -qx CLOUDFLARE_API_TOKEN; then
  sleep 5
  run=$(gh run list --workflow deploy.yml --branch main --limit 1 --json databaseId --jq '.[0].databaseId')
  gh run watch "$run" --exit-status
else
  ALLOW_DEPLOY=1 bash scripts/deploy.sh
fi
