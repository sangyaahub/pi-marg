#!/usr/bin/env bash
set -euo pipefail

found_runtime="false"

if command -v pi >/dev/null 2>&1; then
  echo "[ok] Pi: $(pi --version 2>/dev/null | head -n 1)"
  found_runtime="true"
else
  echo "[optional] Pi is not on PATH"
fi

if command -v omp >/dev/null 2>&1; then
  echo "[ok] OMP: $(omp --version 2>/dev/null | head -n 1)"
  found_runtime="true"
else
  echo "[optional] OMP is not on PATH"
fi

if [[ "${found_runtime}" != "true" ]]; then
  echo "Install Pi or OMP before installing PiMarg." >&2
  exit 1
fi

if command -v codegraph >/dev/null 2>&1; then
  echo "[ok] CodeGraph CLI is available"
else
  echo "[optional] CodeGraph is missing; use setup-codegraph.sh for existing repositories"
fi

for tool in git bun; do
  if command -v "${tool}" >/dev/null 2>&1; then
    echo "[ok] ${tool} is available"
  else
    echo "[optional] ${tool} is not on PATH"
  fi
done
