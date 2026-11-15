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

```bash
# Setup virtual environment and sync dependencies
uv sync

# Run tests
uv run pytest

# Lint and format
uv run ruff check
uv run ruff format
```

