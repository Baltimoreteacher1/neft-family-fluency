#!/usr/bin/env bash
# "Deploy live": run the unit tests, push HEAD to main, deploy it, verify it.
# Commit first; deploy.sh refuses a dirty tree.
#
#   npm run ship
set -euo pipefail

npm test --silent
git push origin HEAD:main
ALLOW_DEPLOY=1 bash scripts/deploy.sh
