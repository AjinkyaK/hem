"""Unit tests for TailorOutput schema and tailor_resume node."""

from unittest.mock import AsyncMock

import pytest
from pydantic import ValidationError

from agentic_resume_tailor.nodes.tailor_resume import tailor_resume
from agentic_resume_tailor.types import JobDetails, TailorOutput


def test_validates_complete_valid_tailor_output():
    output = TailorOutput(
        thinking="Phase 1 reasoning here...",
        resume="# Jane Doe\n\n## Professional summary\n...",
    )
    assert output.thinking == "Phase 1 reasoning here..."
    assert output.resume.startswith("# Jane Doe")


def test_rejects_missing_thinking():
    with pytest.raises(ValidationError):
        TailorOutput(resume="# Resume")


def test_rejects_missing_resume():
    with pytest.raises(ValidationError):
        TailorOutput(thinking="Reasoning")


def test_rejects_non_string_fields():
    with pytest.raises(ValidationError):
        TailorOutput(thinking=123, resume="# Resume")
    with pytest.raises(ValidationError):
        TailorOutput(thinking="Reasoning", resume={"content": "# Resume"})


def test_accepts_empty_strings_for_both_fields():
    output = TailorOutput(thinking="", resume="")
    assert output.thinking == ""
    assert output.resume == ""


@pytest.mark.asyncio
async def test_tailor_resume_extracts_resume_draft(base_job_details):
    mock_model = AsyncMock()
    mock_model.ainvoke.return_value = TailorOutput(
        thinking="Phase 1 reasoning",
        resume="# Tailored Resume\n\n## Professional summary\n...",
    )

    state = {
        "messages": [],
        "raw_job_input": "raw job text",
        "raw_resume_input": "Original resume content",
        "job_details": JobDetails(**base_job_details),
        "resume_draft": None,
        "draft_version": 0,
        "user_feedback": None,
    }

    result = await tailor_resume(state, model=mock_model)
    assert result["resume_draft"] == "# Tailored Resume\n\n## Professional summary\n..."
    assert result["draft_version"] == 1
    assert "user_feedback" not in result
    assert mock_model.ainvoke.await_count == 1


@pytest.mark.asyncio
async def test_tailor_resume_throws_when_raw_resume_input_empty(base_job_details):
    mock_model = AsyncMock()
    state = {
        "messages": [],
        "raw_job_input": "raw job text",
        "raw_resume_input": "   ",
        "job_details": JobDetails(**base_job_details),
    }

    with pytest.raises(ValueError, match="rawResumeInput is empty"):
        await tailor_resume(state, model=mock_model)
    assert mock_model.ainvoke.await_count == 0


@pytest.mark.asyncio
async def test_tailor_resume_throws_when_job_details_null():
    mock_model = AsyncMock()
    state = {
        "messages": [],
        "raw_job_input": "raw job text",
        "raw_resume_input": "Original resume",
        "job_details": None,
    }

    with pytest.raises(ValueError, match="jobDetails is null"):
        await tailor_resume(state, model=mock_model)
    assert mock_model.ainvoke.await_count == 0
