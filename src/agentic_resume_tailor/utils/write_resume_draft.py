"""Disk writer for Resume Drafts."""

import os
import re
from pathlib import Path

from agentic_resume_tailor.types import JobDetails


def get_default_output_dir() -> str:
    """Return default output directory from environment or user home directory."""
    return os.environ.get(
        "TAILORED_RESUME_DIR",
        str(Path.home() / "TailoredResumes"),
    )


def slugify(text: str) -> str:
    """Slugify text by keeping alphanumerics and converting whitespace to underscores."""
    lowered = text.lower()
    cleaned = re.sub(r"[^a-z0-9\s]", "", lowered).strip()
    return re.sub(r"\s+", "_", cleaned)


def write_resume_draft(
    draft: str,
    job_details: JobDetails,
    revision: int,
    output_dir: str | None = None,
) -> str:
    """Write resume draft markdown to disk and return absolute file path."""
    target_dir = Path(
        output_dir if output_dir is not None else get_default_output_dir()
    )
    company = slugify(job_details.company)
    title = slugify(job_details.title)
    filename = f"{company}_{title}_rev{revision}.md"
    file_path = target_dir / filename

    target_dir.mkdir(parents=True, exist_ok=True)
    file_path.write_text(draft, encoding="utf-8")

    return str(file_path.resolve())
