"""Node for extracting structured Job Details from a Job Posting."""

import os

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from agentic_resume_tailor.prompts.extract_job_details import (
    EXTRACT_JOB_DETAILS_SYSTEM_PROMPT,
)
from agentic_resume_tailor.state import AgentState
from agentic_resume_tailor.types import JobDetails


def get_structured_model():
    """Build structured ChatAnthropic model for JobDetails extraction."""
    return ChatAnthropic(
        model="claude-haiku-4-5-20251001",
        api_key=os.environ.get("ANTHROPIC_API_KEY"),
        max_retries=2,
    ).with_structured_output(JobDetails)


async def extract_job_details(
    state: AgentState,
    _config: RunnableConfig | None = None,
    model=None,
) -> dict:
    """Extract 14 structured Job Details fields from raw_job_input."""
    raw_input = state.get("raw_job_input", "")
    if not raw_input or not raw_input.strip():
        raise ValueError("extractJobDetails: raw_job_input is empty")

    structured_model = model if model is not None else get_structured_model()
    result = await structured_model.ainvoke(
        [
            SystemMessage(content=EXTRACT_JOB_DETAILS_SYSTEM_PROMPT),
            HumanMessage(content=raw_input),
        ]
    )

    return {"job_details": result}
