"""Unit tests for review_draft node."""

from unittest.mock import MagicMock

import pytest

from agentic_resume_tailor.nodes.review_draft import review_draft
from agentic_resume_tailor.types import JobDetails


@pytest.mark.asyncio
async def test_review_draft_writes_file_and_returns_feedback(base_job_details):
    mock_writer = MagicMock(return_value="/tmp/fake_v1.md")
    mock_interrupt = MagicMock(return_value="approve")

    job_details = JobDetails(**base_job_details)
    state = {
        "messages": [],
        "raw_job_input": "",
        "raw_resume_input": "",
        "job_details": job_details,
        "resume_draft": "# Tailored Resume",
        "draft_version": 1,
        "user_feedback": None,
    }

    result = await review_draft(
        state,
        writer_func=mock_writer,
        interrupt_func=mock_interrupt,
    )

    mock_writer.assert_called_once_with("# Tailored Resume", job_details, 1)
    mock_interrupt.assert_called_once()
    assert result["user_feedback"] == "approve"


@pytest.mark.asyncio
async def test_review_draft_includes_file_path_in_interrupt(base_job_details):
    mock_writer = MagicMock(return_value="/tmp/fake_v1.md")
    mock_interrupt = MagicMock(return_value="approve")

    state = {
        "job_details": JobDetails(**base_job_details),
        "resume_draft": "# Tailored Resume",
        "draft_version": 1,
    }

    await review_draft(state, writer_func=mock_writer, interrupt_func=mock_interrupt)
    message = mock_interrupt.call_args[0][0]
    assert "/tmp/fake_v1.md" in message
    assert "Type 'approve' to finalize" in message


@pytest.mark.asyncio
async def test_review_draft_throws_when_resume_draft_null(base_job_details):
    mock_writer = MagicMock()
    mock_interrupt = MagicMock()

    state = {
        "job_details": JobDetails(**base_job_details),
        "resume_draft": None,
    }

    with pytest.raises(ValueError, match="resumeDraft is null"):
        await review_draft(
            state, writer_func=mock_writer, interrupt_func=mock_interrupt
        )
    mock_writer.assert_not_called()
    mock_interrupt.assert_not_called()


@pytest.mark.asyncio
async def test_review_draft_throws_when_job_details_null():
    mock_writer = MagicMock()
    mock_interrupt = MagicMock()

    state = {
        "job_details": None,
        "resume_draft": "# Tailored Resume",
    }

    with pytest.raises(ValueError, match="jobDetails is null"):
        await review_draft(
            state, writer_func=mock_writer, interrupt_func=mock_interrupt
        )
    mock_writer.assert_not_called()
    mock_interrupt.assert_not_called()


@pytest.mark.asyncio
async def test_review_draft_is_idempotent(base_job_details):
    mock_writer = MagicMock(return_value="/tmp/fake_v1.md")
    mock_interrupt = MagicMock(return_value="approve")

    state = {
        "job_details": JobDetails(**base_job_details),
        "resume_draft": "# Tailored Resume",
        "draft_version": 1,
    }

    result1 = await review_draft(
        state, writer_func=mock_writer, interrupt_func=mock_interrupt
    )
    result2 = await review_draft(
        state, writer_func=mock_writer, interrupt_func=mock_interrupt
    )

    assert mock_writer.call_count == 2
    assert mock_writer.call_args_list[0] == mock_writer.call_args_list[1]
    assert result1["user_feedback"] == result2["user_feedback"]
