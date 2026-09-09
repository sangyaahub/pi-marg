# Contributing

Thank you for improving PiMarg.

1. Open an issue or discussion for material workflow or compatibility changes.
2. Keep shared decisions in `core/` and runtime differences in `adapters/pi/` or `adapters/omp/`.
3. Do not weaken the A/C or B/D separation rule, evidence gates, or protected-action defaults without an explicit security rationale.
4. Run `./scripts/validate.sh` and `bun test tests`.
5. Describe which Pi and OMP versions you tested and any capability left unverified.

By submitting a contribution, you agree that it may be distributed under this repository's MIT License.
