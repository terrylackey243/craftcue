#!/bin/sh
# Build the image and (re)start it with your local compose.yml (copy compose.example.yml first).
# Builds with host networking because some Docker hosts have broken container DNS during builds.
set -eu
cd "$(dirname "$0")"
IMAGE=craftcue-craftcue
docker build --network=host -t "$IMAGE" .
docker compose up -d --no-build --force-recreate
echo "Deployed."
