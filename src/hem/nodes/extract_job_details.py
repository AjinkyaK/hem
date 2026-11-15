"""Node for extracting structured Job Details from a Job Posting."""

import os
from typing import cast

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from pydantic import SecretStr

from hem.prompts.extract_job_details import (
    EXTRACT_JOB_DETAILS_SYSTEM_PROMPT,
)
from hem.state import AgentState
from hem.types import JobDetails


def get_structured_model():
    """Build structured ChatAnthropic model for JobDetails extraction."""
    return ChatAnthropic(
        model_name="claude-haiku-4-5-20251001",
        # None is fine at runtime: ChatAnthropic then resolves the key itself.
        api_key=cast(SecretStr, os.environ.get("ANTHROPIC_API_KEY")),
        max_retries=2,
        timeout=None,
        stop=None,
    ).with_structured_output(JobDetails)


async def extract_job_details(
    state: AgentState,
    _config: RunnableConfig | None = None,
    model=None,
) -> dict:
    """Extract 14 structured Job Details fields from job_posting."""
    job_posting = state.get("job_posting", "")
    if not job_posting or not job_posting.strip():
        raise ValueError("extract_job_details: job_posting is empty")

    structured_model = model if model is not None else get_structured_model()
    result = await structured_model.ainvoke(
        [
            SystemMessage(content=EXTRACT_JOB_DETAILS_SYSTEM_PROMPT),
            HumanMessage(content=job_posting),
        ]
    )

    return {"job_details": result}
