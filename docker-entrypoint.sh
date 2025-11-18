#!/bin/sh
set -e

# Refresh repo contents when the container starts so firmware assets stay up to date.
if [ -d ".git" ]; then
  CURRENT_BRANCH="$(git symbolic-ref --short HEAD 2>/dev/null || true)"
  if [ -z "$CURRENT_BRANCH" ] || [ "$CURRENT_BRANCH" = "HEAD" ]; then
    CURRENT_BRANCH="$(git remote show origin 2>/dev/null | awk '/HEAD branch/ {print $NF}')"
  fi
  CURRENT_BRANCH="${CURRENT_BRANCH:-main}"
  echo "[entrypoint] Pulling latest changes for ${CURRENT_BRANCH}..."
  git fetch origin "$CURRENT_BRANCH" --tags
  git reset --hard "origin/${CURRENT_BRANCH}"
  git clean -fd
else
  echo "[entrypoint] .git directory missing, skipping auto-update."
fi

exec "$@"
