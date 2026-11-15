# Agent Instructions

## Agent skills

### Issue tracker

GitHub Issues on `AjinkyaK/hem`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical 5-role defaults (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout (`GLOSSARY.md` and `docs/adr/` at repo root). See `docs/agents/domain.md`.

### Checks and merging

- Before calling work done, run `uv run pre-commit run --all-files` and `uv run pytest`, and fix anything that fails.
- Never use `--no-verify`, and never add `# type: ignore` / `# noqa` just to get past a check.

See README `## Development`.
