# Hem

A LangGraph-based workflow that tailors an Applicant's Base Resume to a Job Posting, iterating on markdown Resume Drafts through Human Review. Domain terms are defined in [`GLOSSARY.md`](GLOSSARY.md).

## Architecture

- **parse_job_posting**: Detects whether the input is a URL or raw text; fetches and extracts clean article text using `httpx` and `trafilatura`.
- **extract_job_details**: Uses Claude Haiku structured output (`pydantic` v2 `JobDetails`) to extract Job Details from the Job Posting.
- **tailor_resume**: Tailoring: turns the Base Resume and Job Details into the Resume Draft at Revision 1.
- **human_review**: Writes the Resume Draft to disk as `<company>_<title>_rev<N>.md` (`~/TailoredResumes/` or `$TAILORED_RESUME_DIR`) and interrupts execution for Human Review.
- **revise_resume**: Applies the Applicant's Revision Feedback to produce the next Revision.
- **after_review**: Conditional router (`"approve"` -> finish, Revision Feedback -> `revise_resume`).

## Development

### Setup

```bash
uv sync
uv run pre-commit install
```

`uv sync` doesn't install the git hook, so run `uv run pre-commit install` once per clone (worktrees share it). The hook is check-only: it never rewrites files.

### Checks

| Command | Pre-commit hook? | CI? |
|---|---|---|
| `uv run ruff check` | Yes, on staged Python files | Yes |
| `uv run ruff format --check` | Yes, on staged Python files | Yes |
| `uv run pyright` | Yes, on the whole project | Yes |
| `uv run pytest` | No | Yes |

Tests run only in CI, to keep the hook under 3s.

### Run everything locally

```bash
uv run pre-commit run --all-files
uv run pytest
```

### Fix

```bash
uv run ruff check --fix && uv run ruff format
```

### CI

The `ci` GitHub Actions job runs all four checks (`ruff check`, `ruff format --check`, `pyright`, `pytest`) on every PR and every push to `main`, and it is the required status check.

### Agent runs

The `Agent implement` workflow (`.github/workflows/agent-implement.yml`) runs a coding agent on one `ready-for-agent` issue and opens a PR for it. It uses [sandcastle](https://github.com/mattpocock/sandcastle), pinned in `package.json`, to run Claude Code in a Docker sandbox built from `.sandcastle/Dockerfile`. The agent's instructions are in `.sandcastle/prompt.md`.

**One-time setup.** Create two repository secrets:

| Secret | What it is |
|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | Output of `claude setup-token`. Runs bill to that Claude subscription. |
| `AGENT_PAT` | A fine-grained personal access token for this repo only, with read and write access to Contents, Issues and Pull requests. It is needed because a PR opened with the default `GITHUB_TOKEN` doesn't trigger `ci`. |

**Start a run** from the Actions tab, or:

```bash
gh workflow run agent-implement.yml            # oldest eligible issue
gh workflow run agent-implement.yml -f issue=43
```

An issue is eligible when it is open, labelled `ready-for-agent`, has no sub-issues, no assignee, no open `blocked_by` issues and no open PR that says `Closes #<n>`, and was written by someone with write access. `.sandcastle/scripts/pick-issue.sh` applies these rules; run it locally to see why an issue is skipped.

**What a run does.**

1. Assigns the issue to the `AGENT_PAT` owner.
2. Lets the agent commit to `agent/issue-<n>-<slug>`.
3. Re-runs `pre-commit` and `pytest` on that branch.
4. Opens a PR that closes the issue. The PR is a draft, with the failing output attached, if the checks failed.

If the agent makes no commits, the run unassigns the issue and comments with a link to the log. The PR is then reviewed and squash-merged like any other.

**Trust boundary.** The agent's container gets only `CLAUDE_CODE_OAUTH_TOKEN`. It has no GitHub token, so it can't push, comment or read other issues: the workflow does all of that on the host. Issue text becomes the agent's prompt, which is why issues from people without write access are refused.
### Merging to main

Changes reach `main` only through a pull request, which is squash-merged once `ci` passes. Nobody pushes to `main` directly, agents included. The repository ruleset `main` enforces this with no bypass for anyone: it requires a PR and a green `ci` check, allows squash merges only, keeps history linear, and blocks force-pushes and deletion of `main`.

The ruleset is recorded in [`.github/rulesets/main.json`](.github/rulesets/main.json). GitHub doesn't sync this file, so edits made to the ruleset in the UI make it stale.

**Emergency fix.** If a fix must land on `main` without a PR, an admin disables the ruleset, pushes the fix, then re-enables it straight away:

```bash
# Look up the ruleset's id
RULESET_ID=$(gh api repos/AjinkyaK/hem/rulesets --jq '.[] | select(.name == "main") | .id')

# Disable it
gh api --method PUT "repos/AjinkyaK/hem/rulesets/$RULESET_ID" -f enforcement=disabled

# Push the fix
git push origin main

# Re-enable it
gh api --method PUT "repos/AjinkyaK/hem/rulesets/$RULESET_ID" -f enforcement=active
```
