#!/usr/bin/env bash
set -euo pipefail

runtime=""
mode="dry-run"

usage() {
  echo "Usage: $0 --runtime <pi|omp|both> [--apply]" >&2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --runtime)
      [[ $# -ge 2 ]] || { usage; exit 2; }
      runtime="$2"
      shift 2
      ;;
    --apply)
      mode="apply"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

case "${runtime}" in
  pi|omp|both) ;;
  *)
    echo "--runtime must be pi, omp, or both." >&2
    usage
    exit 2
    ;;
esac

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
package_root="$(cd "${script_dir}/.." && pwd)"

print_pi() {
  echo "[Pi] pi install ${package_root}"
}

print_omp() {
  echo "[OMP] omp plugin marketplace add ${package_root}"
  echo "[OMP] omp plugin install --scope user pi-marg@pi-marg-marketplace"
}

if [[ "${mode}" == "dry-run" ]]; then
  echo "Preview only; no configuration will be changed."
  [[ "${runtime}" == "pi" || "${runtime}" == "both" ]] && print_pi
  [[ "${runtime}" == "omp" || "${runtime}" == "both" ]] && print_omp
  echo "Run again with --apply to install."
  exit 0
fi

if [[ "${runtime}" == "pi" || "${runtime}" == "both" ]]; then
  command -v pi >/dev/null 2>&1 || { echo "Pi is not available on PATH." >&2; exit 1; }
  pi install "${package_root}"
fi

if [[ "${runtime}" == "omp" || "${runtime}" == "both" ]]; then
  command -v omp >/dev/null 2>&1 || { echo "OMP is not available on PATH." >&2; exit 1; }
  omp plugin marketplace add "${package_root}"
  omp plugin install --scope user pi-marg@pi-marg-marketplace
fi

echo "PiMarg v1.0.1 installed for ${runtime}. Start a fresh runtime session, then run /pi-marg."
