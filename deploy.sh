#!/bin/sh
# Build the image and (re)start it with your local compose.yml (copy compose.example.yml first).
# Builds with host networking because some Docker hosts have broken container DNS during builds.
set -eu
cd "$(dirname "$0")"
IMAGE=craftcue-craftcue
# Build settings for this copy (accounts, sync) live in an untracked file; see deploy.env.example.
BUILD_ARGS=""
if [ -f deploy.env ]; then
  while IFS='=' read -r k v; do
    case "$k" in ''|\#*) continue ;; esac
    BUILD_ARGS="$BUILD_ARGS --build-arg $k=$v"
  done < deploy.env
fi
# shellcheck disable=SC2086
docker build --network=host $BUILD_ARGS -t "$IMAGE" .
docker compose up -d --no-build --force-recreate
echo "Deployed."
