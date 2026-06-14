#!/bin/sh
set -euo pipefail

cd "$CI_WORKSPACE"

echo "[ci_post_clone] Node: $(node --version)"
echo "[ci_post_clone] npm: $(npm --version)"

npm ci
npm run build
npx cap sync ios

cd ios/App
pod install
