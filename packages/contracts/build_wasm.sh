#!/usr/bin/env bash
set -e
export PATH="$HOME/.local/node/bin:$PATH"
echo "Node version: $(node -v)"
rm -rf /tmp/predictee-wasm-build
mkdir -p /tmp/predictee-wasm-build
cp /mnt/e/vscode/predictee/packages/contracts/package.json /tmp/predictee-wasm-build/
cp /mnt/e/vscode/predictee/packages/contracts/tsconfig.json /tmp/predictee-wasm-build/
cp -r /mnt/e/vscode/predictee/packages/contracts/src /tmp/predictee-wasm-build/
cd /tmp/predictee-wasm-build
npm install
npx near-sdk-js build src/index.ts build/predictee.wasm --verbose
mkdir -p /mnt/e/vscode/predictee/packages/contracts/build
cp build/predictee.wasm /mnt/e/vscode/predictee/packages/contracts/build/predictee.wasm
ls -lh /mnt/e/vscode/predictee/packages/contracts/build/predictee.wasm
