"""Unit tests for human_review node."""

from unittest.mock import MagicMock

import pytest

from hem.nodes.human_review import human_review
from hem.state import AgentState
from hem.types import JobDetails


@pytest.mark.asyncio
async def test_human_review_writes_file_and_returns_feedback(base_job_details):
    mock_writer = MagicMock(return_value="/tmp/fake_rev1.md")
    mock_interrupt = MagicMock(return_value="approve")

    job_details = JobDetails(**base_job_details)
    state: AgentState = {
        "messages": [],
        "job_posting": "",
        "base_resume": "",
        "job_details": job_details,
        "resume_draft": "# Resume Draft",
        "revision": 1,
        "user_feedback": None,
    }

    result = await human_review(
        state,
        writer_func=mock_writer,
        interrupt_func=mock_interrupt,
    )

    mock_writer.assert_called_once_with("# Resume Draft", job_details, 1)
    mock_interrupt.assert_called_once()
    assert result["user_feedback"] == "approve"


@pytest.mark.asyncio
async def test_human_review_includes_file_path_in_interrupt(base_job_details):
    mock_writer = MagicMock(return_value="/tmp/fake_rev1.md")
    mock_interrupt = MagicMock(return_value="approve")

    state: AgentState = {
        "job_details": JobDetails(**base_job_details),
        "resume_draft": "# Resume Draft",
        "revision": 1,
    }

    await human_review(state, writer_func=mock_writer, interrupt_func=mock_interrupt)
    message = mock_interrupt.call_args[0][0]
    assert "/tmp/fake_rev1.md" in message
    assert "Type 'approve' to finalize" in message


@pytest.mark.asyncio
async def test_human_review_throws_when_resume_draft_null(base_job_details):
    mock_writer = MagicMock()
    mock_interrupt = MagicMock()

    state: AgentState = {
        "job_details": JobDetails(**base_job_details),
        "resume_draft": None,
    }

    with pytest.raises(ValueError, match="resume_draft is null"):
        await human_review(
            state, writer_func=mock_writer, interrupt_func=mock_interrupt
        )
    mock_writer.assert_not_called()
    mock_interrupt.assert_not_called()


@pytest.mark.asyncio
async def test_human_review_throws_when_job_details_null():
    mock_writer = MagicMock()
    mock_interrupt = MagicMock()

    state: AgentState = {
        "job_details": None,
        "resume_draft": "# Resume Draft",
    }

    with pytest.raises(ValueError, match="job_details is null"):
        await human_review(
            state, writer_func=mock_writer, interrupt_func=mock_interrupt
        )
    mock_writer.assert_not_called()
    mock_interrupt.assert_not_called()


@pytest.mark.asyncio
async def test_human_review_is_idempotent(base_job_details):
    mock_writer = MagicMock(return_value="/tmp/fake_rev1.md")
    mock_interrupt = MagicMock(return_value="approve")

    state: AgentState = {
        "job_details": JobDetails(**base_job_details),
        "resume_draft": "# Resume Draft",
        "revision": 1,
    }

    result1 = await human_review(
        state, writer_func=mock_writer, interrupt_func=mock_interrupt
    )
    result2 = await human_review(
        state, writer_func=mock_writer, interrupt_func=mock_interrupt
    )

    assert mock_writer.call_count == 2
    assert mock_writer.call_args_list[0] == mock_writer.call_args_list[1]
    assert result1["user_feedback"] == result2["user_feedback"]
