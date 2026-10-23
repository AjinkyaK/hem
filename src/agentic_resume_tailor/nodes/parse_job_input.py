"""Node for parsing job input (handling plain text vs URL extraction)."""

import httpx
import trafilatura
from langchain_core.runnables import RunnableConfig

from agentic_resume_tailor.state import AgentState


def is_url(input_str: str) -> bool:
    """Check if input begins with http:// or https://."""
    stripped = input_str.lstrip()
    return stripped.startswith("http://") or stripped.startswith("https://")


async def fetch_and_strip_html(url: str) -> str:
    """Fetch HTML content from a URL and extract readable text."""
    async with httpx.AsyncClient() as client:
        response = await client.get(url, follow_redirects=True)
        if response.status_code >= 400:
            raise RuntimeError(
                f"Failed to fetch job posting: {response.status_code} {response.reason_phrase}"
            )
        html = response.text

    content = trafilatura.extract(html, include_comments=False)
    if not content or not content.strip():
        raise RuntimeError("Failed to extract readable job posting content from URL")
    return content.strip()


async def parse_job_input(
    state: AgentState,
    _config: RunnableConfig | None = None,
) -> dict:
    """Parse rawJobInput: return plain text as-is or fetch and parse if a URL."""
    raw_input = state.get("raw_job_input", "")
    if not raw_input or not raw_input.strip():
        raise ValueError("raw_job_input is required")

    trimmed_input = raw_input.strip()
    if not is_url(trimmed_input):
        return {"raw_job_input": state["raw_job_input"]}

    text = await fetch_and_strip_html(trimmed_input)
    return {"raw_job_input": text}
