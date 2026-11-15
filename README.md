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
