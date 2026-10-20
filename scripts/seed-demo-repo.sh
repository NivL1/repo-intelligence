#!/usr/bin/env bash
# Seeds the one repository a public demo deployment serves.
#
# Run this BEFORE turning DEMO_MODE on — registration and repository
# creation are both blocked outright once it's on (see DemoWriteGuard),
# by design: seeding has to happen through the normal, authenticated
# flow while it's still available, not through some special bypass in
# the app itself. Flip DEMO_MODE=true only after this script reports
# the repo as "ready".
#
# Usage:
#   BASE_URL=https://your-app.fly.dev \
#   DEMO_EMAIL=demo-seed@example.com \
#   DEMO_PASSWORD='a-real-password-at-least-8-chars' \
#   REPO_SOURCE=https://github.com/NivL1/nestjs-ai-starter \
#     ./scripts/seed-demo-repo.sh
set -euo pipefail

BASE_URL="${BASE_URL:?set BASE_URL, e.g. https://your-app.fly.dev}"
DEMO_EMAIL="${DEMO_EMAIL:?set DEMO_EMAIL}"
DEMO_PASSWORD="${DEMO_PASSWORD:?set DEMO_PASSWORD (min 8 chars)}"
REPO_SOURCE="${REPO_SOURCE:?set REPO_SOURCE, e.g. https://github.com/owner/repo}"

# A password is allowed to contain quotes, backslashes, anything —
# building the JSON body with shell string interpolation (the previous
# version of this script) would send malformed JSON for such a password,
# or worse, misinterpret it. Values are passed as argv, not read back out
# of the environment — argv needs no `export` and has no ambiguity about
# which shell variable a name refers to.
json_body() {
  python3 -c '
import json, sys
print(json.dumps(dict(zip(sys.argv[1::2], sys.argv[2::2]))))
' "$@"
}

echo "Registering (or logging in, if this has already run once)..."
TOKEN=$(
  curl -sf -X POST "$BASE_URL/auth/register" \
    -H 'Content-Type: application/json' \
    -d "$(json_body email "$DEMO_EMAIL" password "$DEMO_PASSWORD")" \
    2>/dev/null \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["accessToken"])' \
  || curl -sf -X POST "$BASE_URL/auth/login" \
    -H 'Content-Type: application/json' \
    -d "$(json_body email "$DEMO_EMAIL" password "$DEMO_PASSWORD")" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["accessToken"])'
)

echo "Registering repository: $REPO_SOURCE"
REPO_ID=$(
  curl -sf -X POST "$BASE_URL/repositories" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d "$(json_body source "$REPO_SOURCE")" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])'
)
echo "Repository id: $REPO_ID"

echo "Indexing (this runs the full clone + compile + embed pipeline, can take a minute)..."
curl -sf -X POST "$BASE_URL/repositories/$REPO_ID/index" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -m json.tool

echo ""
echo "Done. Verify at: $BASE_URL/repositories/$REPO_ID"
echo "Once you're happy with it, set DEMO_MODE=true and redeploy."
