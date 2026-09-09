#!/usr/bin/env bash
set -euo pipefail

mode="dry-run"
repo_path="${PWD}"

if [[ "${1:-}" == "--apply" ]]; then
  mode="apply"
  shift
fi

if [[ $# -gt 1 ]]; then
  echo "Usage: $0 [--apply] [repository-path]" >&2
  exit 2
fi

if [[ $# -eq 1 ]]; then
  repo_path="$1"
fi

if [[ ! -d "${repo_path}" ]]; then
  echo "Repository path is not a directory: ${repo_path}" >&2
  exit 1
fi

repo_root="$(git -C "${repo_path}" rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${repo_root}" ]]; then
  echo "Not a Git repository: ${repo_path}" >&2
  exit 1
fi

echo "Repository: ${repo_root}"

if [[ "${mode}" == "dry-run" ]]; then
  if command -v codegraph >/dev/null 2>&1; then
    echo "[ok] CodeGraph CLI is installed"
  else
    echo "[would install] npm install -g @colbymchenry/codegraph@latest"
  fi
  if [[ -d "${repo_root}/.codegraph" ]]; then
    echo "[would verify] codegraph status \"${repo_root}\""
  else
    echo "[would initialize] codegraph init \"${repo_root}\""
  fi
  echo "Run $0 --apply \"${repo_root}\" to make these changes."
  exit 0
fi

if ! command -v codegraph >/dev/null 2>&1; then
  if ! command -v npm >/dev/null 2>&1; then
    echo "npm is required to install CodeGraph." >&2
    exit 1
  fi
  npm install -g @colbymchenry/codegraph@latest
fi

if [[ ! -d "${repo_root}/.codegraph" ]]; then
  codegraph init "${repo_root}"
fi

codegraph status "${repo_root}"
echo "CodeGraph is ready. Restart the active Pi or OMP session if this is the first installation so its integration can be detected."
