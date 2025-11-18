#!/bin/sh
set -e

# Refresh repo contents when the container starts so firmware assets stay up to date.
if [ -d ".git" ]; then
  CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"
  echo "[entrypoint] Pulling latest changes for ${CURRENT_BRANCH}..."
  git fetch origin "$CURRENT_BRANCH" --tags
  git reset --hard "origin/${CURRENT_BRANCH}"
  git clean -fd
else
  echo "[entrypoint] .git directory missing, skipping auto-update."
fi

exec "$@"
