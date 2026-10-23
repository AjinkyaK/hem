"""Unit tests for revise_resume node."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from agentic_resume_tailor.nodes.revise_resume import revise_resume
from agentic_resume_tailor.types import JobDetails


@pytest.mark.asyncio
async def test_revise_resume_increments_version_and_updates_draft(base_job_details):
    mock_model = AsyncMock()
    mock_response = MagicMock()
    mock_response.content = "# Revised Resume"
    mock_model.ainvoke.return_value = mock_response

    state = {
        "messages": [],
        "raw_job_input": "",
        "raw_resume_input": "",
        "job_details": JobDetails(**base_job_details),
        "resume_draft": "# Old Resume",
        "draft_version": 1,
        "user_feedback": "Make summary shorter",
    }

    result = await revise_resume(state, model=mock_model)
    assert result["resume_draft"] == "# Revised Resume"
    assert result["draft_version"] == 2
    assert "user_feedback" not in result
    assert mock_model.ainvoke.await_count == 1


@pytest.mark.asyncio
async def test_revise_resume_throws_when_resume_draft_null(base_job_details):
    mock_model = AsyncMock()
    state = {
        "job_details": JobDetails(**base_job_details),
        "resume_draft": None,
        "user_feedback": "Make summary shorter",
    }

    with pytest.raises(ValueError, match="resumeDraft is null"):
        await revise_resume(state, model=mock_model)
    assert mock_model.ainvoke.await_count == 0


@pytest.mark.asyncio
async def test_revise_resume_throws_when_user_feedback_null(base_job_details):
    mock_model = AsyncMock()
    state = {
        "job_details": JobDetails(**base_job_details),
        "resume_draft": "# Old Resume",
        "user_feedback": None,
    }

    with pytest.raises(ValueError, match="userFeedback is null"):
        await revise_resume(state, model=mock_model)
    assert mock_model.ainvoke.await_count == 0


@pytest.mark.asyncio
async def test_revise_resume_throws_when_job_details_null():
    mock_model = AsyncMock()
    state = {
        "job_details": None,
        "resume_draft": "# Old Resume",
        "user_feedback": "Make summary shorter",
    }

    with pytest.raises(ValueError, match="jobDetails is null"):
        await revise_resume(state, model=mock_model)
    assert mock_model.ainvoke.await_count == 0
