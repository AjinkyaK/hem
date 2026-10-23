"""Unit tests for parse_job_input node."""

from unittest.mock import AsyncMock, patch

import httpx
import pytest

from agentic_resume_tailor.nodes.parse_job_input import is_url, parse_job_input

BASE_STATE = {
    "messages": [],
    "raw_job_input": "",
    "raw_resume_input": "My resume content",
    "job_details": None,
    "resume_draft": None,
    "draft_version": 0,
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
    state = {**BASE_STATE, "raw_job_input": "Senior Engineer at Acme Corp..."}
    result = await parse_job_input(state)
    assert result["raw_job_input"] == "Senior Engineer at Acme Corp..."


@pytest.mark.asyncio
async def test_returns_plain_text_unchanged_for_non_http_protocols():
    state = {**BASE_STATE, "raw_job_input": "ftp://jobs.example.com/spec.txt"}
    result = await parse_job_input(state)
    assert result["raw_job_input"] == "ftp://jobs.example.com/spec.txt"


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
            state = {
                **BASE_STATE,
                "raw_job_input": "https://jobs.example.com/posting/123",
            }
            result = await parse_job_input(state)
            assert result["raw_job_input"] == "Job posting text here"
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
            state = {
                **BASE_STATE,
                "raw_job_input": "   https://jobs.example.com/posting/123   ",
            }
            result = await parse_job_input(state)
            assert result["raw_job_input"] == "Job posting text here"
            mock_get.assert_called_once_with(
                "https://jobs.example.com/posting/123", follow_redirects=True
            )


@pytest.mark.asyncio
async def test_throws_when_fetch_response_not_ok():
    mock_resp = httpx.Response(404, text="Not found")
    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_resp
        state = {**BASE_STATE, "raw_job_input": "https://jobs.example.com/missing"}
        with pytest.raises(
            RuntimeError, match="Failed to fetch job posting: 404 Not Found"
        ):
            await parse_job_input(state)


@pytest.mark.asyncio
async def test_throws_when_fetch_network_call_rejects():
    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.side_effect = httpx.ConnectError("Network connection refused")
        state = {
            **BASE_STATE,
            "raw_job_input": "https://jobs.example.com/network-error",
        }
        with pytest.raises(httpx.ConnectError, match="Network connection refused"):
            await parse_job_input(state)


@pytest.mark.asyncio
async def test_throws_when_raw_job_input_empty():
    state = {**BASE_STATE, "raw_job_input": ""}
    with pytest.raises(ValueError, match="raw_job_input is required"):
        await parse_job_input(state)


@pytest.mark.asyncio
async def test_throws_when_raw_job_input_whitespace_only():
    state = {**BASE_STATE, "raw_job_input": "   \n\t  "}
    with pytest.raises(ValueError, match="raw_job_input is required"):
        await parse_job_input(state)


@pytest.mark.asyncio
async def test_terminates_early_when_extraction_returns_none():
    mock_resp = httpx.Response(
        200, text="<html><body><div>Empty / unparseable</div></body></html>"
    )
    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_resp
        with patch("trafilatura.extract", return_value=None):
            state = {
                **BASE_STATE,
                "raw_job_input": "https://jobs.example.com/unreadable",
            }
            with pytest.raises(
                RuntimeError,
                match="Failed to extract readable job posting content from URL",
            ):
                await parse_job_input(state)


@pytest.mark.asyncio
async def test_terminates_early_when_extraction_returns_empty_string():
    mock_resp = httpx.Response(
        200, text="<html><body><div>Empty / unparseable</div></body></html>"
    )
    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_resp
        with patch("trafilatura.extract", return_value="   "):
            state = {
                **BASE_STATE,
                "raw_job_input": "https://jobs.example.com/empty-article",
            }
            with pytest.raises(
                RuntimeError,
                match="Failed to extract readable job posting content from URL",
            ):
                await parse_job_input(state)


@pytest.mark.asyncio
async def test_strictly_returns_only_raw_job_input():
    state = {**BASE_STATE, "raw_job_input": "Software Engineer opening"}
    result = await parse_job_input(state)
    assert result == {"raw_job_input": "Software Engineer opening"}
