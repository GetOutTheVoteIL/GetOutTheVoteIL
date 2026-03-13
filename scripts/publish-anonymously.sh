#!/bin/sh

set -eu

repo_root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
config_file="$repo_root/.publish.local.env"

if [ ! -f "$config_file" ]; then
  printf '%s\n' "Missing $config_file"
  exit 1
fi

# shellcheck disable=SC1090
. "$config_file"

if [ -z "${GH_TOKEN:-}" ] && [ -n "${PUBLISH_GH_TOKEN_FILE:-}" ] && [ -f "${PUBLISH_GH_TOKEN_FILE}" ]; then
  # shellcheck disable=SC1090
  . "$PUBLISH_GH_TOKEN_FILE"
fi

: "${PUBLISH_GIT_NAME:?Set PUBLISH_GIT_NAME in .publish.local.env}"
: "${PUBLISH_GIT_EMAIL:?Set PUBLISH_GIT_EMAIL in .publish.local.env}"
: "${PUBLISH_REPO_OWNER:?Set PUBLISH_REPO_OWNER in .publish.local.env}"
: "${PUBLISH_REPO_NAME:?Set PUBLISH_REPO_NAME in .publish.local.env}"
: "${GH_TOKEN:?Load GH_TOKEN directly or via PUBLISH_GH_TOKEN_FILE}"

default_branch="${PUBLISH_DEFAULT_BRANCH:-main}"
current_branch=$(git -C "$repo_root" branch --show-current 2>/dev/null || true)
branch_to_push="${current_branch:-$default_branch}"
remote_url="https://github.com/${PUBLISH_REPO_OWNER}/${PUBLISH_REPO_NAME}.git"
commit_message="${1:-Update}"

if ! git -C "$repo_root" remote get-url origin >/dev/null 2>&1; then
  git -C "$repo_root" remote add origin "$remote_url"
fi

git -C "$repo_root" add -A

if ! git -C "$repo_root" diff --cached --quiet; then
  git -C "$repo_root" -c user.name="$PUBLISH_GIT_NAME" -c user.email="$PUBLISH_GIT_EMAIL" commit -m "$commit_message"
fi

askpass_script=$(mktemp)
trap 'rm -f "$askpass_script"' EXIT HUP INT TERM

cat >"$askpass_script" <<EOF
#!/bin/sh
case "\$1" in
  *Username*) printf '%s\n' 'x-access-token' ;;
  *Password*) printf '%s\n' '${GH_TOKEN}' ;;
esac
EOF

chmod 700 "$askpass_script"

GIT_ASKPASS="$askpass_script" \
GIT_TERMINAL_PROMPT=0 \
git -C "$repo_root" push -u origin "$branch_to_push"
