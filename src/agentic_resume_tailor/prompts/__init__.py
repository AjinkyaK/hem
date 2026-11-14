"""Prompt templates for resume tailoring and job details extraction."""

from agentic_resume_tailor.prompts.extract_job_details import (
    EXTRACT_JOB_DETAILS_SYSTEM_PROMPT,
)
from agentic_resume_tailor.prompts.tailor_resume import (
    TAILOR_RESUME_SYSTEM_PROMPT,
)

__all__ = [
    "EXTRACT_JOB_DETAILS_SYSTEM_PROMPT",
    "TAILOR_RESUME_SYSTEM_PROMPT",
]
