# AGENTS.md

## Working rules
- Do NOT include binary media files in PRs with code changes.
- If media assets are needed, create TWO PRs:
  1) PR A: assets-only (static/assets/broker/*)
  2) PR B: code/config-only (no binaries)
- When opening a PR, ensure the diff contains no *.png, *.jpg, *.jpeg, *.webp files.
- If binaries are present, commit them on a separate branch and open an assets-only PR first.
