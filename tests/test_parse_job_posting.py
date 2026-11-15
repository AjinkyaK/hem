"""Unit tests for parse_job_posting node."""

from unittest.mock import AsyncMock, patch

import httpx
import pytest

from hem.nodes.parse_job_posting import is_url, parse_job_posting
from hem.state import AgentState

BASE_STATE: AgentState = {
    "messages": [],
    "job_posting": "",
    "base_resume": "My resume content",
    "job_details": None,
    "resume_draft": None,
    "revision": 0,
    "user_feedback": None,
}


def test_is_url():
    assert is_url("https://example.com") is True
    assert is_url("http://example.com/job") is True
    assert is_url("   https://example.com") is True
    assert is_url("ftp://example.com") is False
    assert is_url("Senior Software Engineer at Acme") is False


@pytest.mark.asyncio
async def test_returns_plain_text_unchanged_when_not_url():
    state: AgentState = {**BASE_STATE, "job_posting": "Senior Engineer at Acme Corp..."}
    result = await parse_job_posting(state)
    assert result["job_posting"] == "Senior Engineer at Acme Corp..."


@pytest.mark.asyncio
async def test_returns_plain_text_unchanged_for_non_http_protocols():
    state: AgentState = {**BASE_STATE, "job_posting": "ftp://jobs.example.com/spec.txt"}
    result = await parse_job_posting(state)
    assert result["job_posting"] == "ftp://jobs.example.com/spec.txt"


@pytest.mark.asyncio
async def test_fetches_and_strips_html_when_input_is_url():
    mock_resp = httpx.Response(
        200,
        text="<html><body><article><p>Job posting text here</p></article></body></html>",
    )
    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_resp
        with patch(
            "trafilatura.extract", return_value="Job posting text here"
        ) as mock_extract:
            state: AgentState = {
                **BASE_STATE,
                "job_posting": "https://jobs.example.com/posting/123",
            }
            result = await parse_job_posting(state)
            assert result["job_posting"] == "Job posting text here"
            mock_get.assert_called_once_with(
                "https://jobs.example.com/posting/123", follow_redirects=True
            )
            mock_extract.assert_called_once()


@pytest.mark.asyncio
async def test_handles_urls_with_leading_and_trailing_whitespace():
    mock_resp = httpx.Response(
        200,
        text="<html><body><article><p>Job posting text here</p></article></body></html>",
    )
    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_resp
        with patch("trafilatura.extract", return_value="Job posting text here"):
            state: AgentState = {
                **BASE_STATE,
                "job_posting": "   https://jobs.example.com/posting/123   ",
            }
            result = await parse_job_posting(state)
            assert result["job_posting"] == "Job posting text here"
            mock_get.assert_called_once_with(
                "https://jobs.example.com/posting/123", follow_redirects=True
            )


@pytest.mark.asyncio
async def test_throws_when_fetch_response_not_ok():
    mock_resp = httpx.Response(404, text="Not found")
    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_resp
        state: AgentState = {
            **BASE_STATE,
            "job_posting": "https://jobs.example.com/missing",
        }
        with pytest.raises(
            RuntimeError, match="Failed to fetch job posting: 404 Not Found"
        ):
            await parse_job_posting(state)


@pytest.mark.asyncio
async def test_throws_when_fetch_network_call_rejects():
    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.side_effect = httpx.ConnectError("Network connection refused")
        state: AgentState = {
            **BASE_STATE,
            "job_posting": "https://jobs.example.com/network-error",
        }
        with pytest.raises(httpx.ConnectError, match="Network connection refused"):
            await parse_job_posting(state)


@pytest.mark.asyncio
async def test_throws_when_job_posting_empty():
    state: AgentState = {**BASE_STATE, "job_posting": ""}
    with pytest.raises(ValueError, match="job_posting is required"):
        await parse_job_posting(state)


@pytest.mark.asyncio
async def test_throws_when_job_posting_whitespace_only():
    state: AgentState = {**BASE_STATE, "job_posting": "   \n\t  "}
    with pytest.raises(ValueError, match="job_posting is required"):
        await parse_job_posting(state)


@pytest.mark.asyncio
async def test_terminates_early_when_extraction_returns_none():
    mock_resp = httpx.Response(
        200, text="<html><body><div>Empty / unparseable</div></body></html>"
    )
    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_resp
        with patch("trafilatura.extract", return_value=None):
            state: AgentState = {
                **BASE_STATE,
                "job_posting": "https://jobs.example.com/unreadable",
            }
            with pytest.raises(
                RuntimeError,
                match="Failed to extract readable job posting content from URL",
            ):
                await parse_job_posting(state)


@pytest.mark.asyncio
async def test_terminates_early_when_extraction_returns_empty_string():
    mock_resp = httpx.Response(
        200, text="<html><body><div>Empty / unparseable</div></body></html>"
    )
    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_resp
        with patch("trafilatura.extract", return_value="   "):
            state: AgentState = {
                **BASE_STATE,
                "job_posting": "https://jobs.example.com/empty-article",
            }
            with pytest.raises(
                RuntimeError,
                match="Failed to extract readable job posting content from URL",
            ):
                await parse_job_posting(state)


@pytest.mark.asyncio
async def test_strictly_returns_only_job_posting():
    state: AgentState = {**BASE_STATE, "job_posting": "Software Engineer opening"}
    result = await parse_job_posting(state)
    assert result == {"job_posting": "Software Engineer opening"}
