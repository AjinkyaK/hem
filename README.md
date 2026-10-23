# Agentic Resume Tailor

A LangGraph-based workflow that analyzes job postings, extracts structured requirements, and iteratively tailors a markdown resume with human-in-the-loop review.

## Architecture

- **parse_job_input**: Detects whether the input is a URL or raw text; fetches and extracts clean article text using `httpx` and `trafilatura`.
- **extract_job_details**: Uses Claude Haiku structured output (`pydantic` v2 `JobDetails`) to extract a 14-field schema from the job posting.
- **tailor_resume**: Takes the base resume and job details to produce draft 1 of the tailored markdown resume.
- **review_draft**: Writes the draft to disk (`~/TailoredResumes/` or `$TAILORED_RESUME_DIR`) and interrupts execution for human verification.
- **revise_resume**: Applies targeted feedback from the candidate to produce an updated revision.
- **after_review**: Conditional router (`"approve"` -> finish, feedback -> `revise_resume`).

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

