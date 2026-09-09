# Security policy

## Reporting a vulnerability

Do not disclose exploitable vulnerabilities in a public issue. Use [GitHub private vulnerability reporting](https://github.com/sangyaahub/pi-marg/security/advisories/new). If that is unavailable, email `contact@sangyaa.co` with the subject `PiMarg security report`.

Include the affected version, runtime, reproduction steps, impact, and any suggested countermeasure. Never include live credentials, client data, or personal information.

## Scope

The approval guard is defense in depth, not an operating-system sandbox. Pi and OMP extensions execute with the user's local permissions. Users must review source code and install only trusted releases.
