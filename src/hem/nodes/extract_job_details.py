"""Node for extracting structured Job Details from a Job Posting."""

import os
from typing import TypedDict

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from pydantic import SecretStr

from hem.prompts.extract_job_details import (
    EXTRACT_JOB_DETAILS_SYSTEM_PROMPT,
)
from hem.state import AgentState
from hem.types import JobDetails


class _ApiKeyKwargs(TypedDict, total=False):
    api_key: SecretStr


def get_structured_model():
    """Build structured ChatAnthropic model for JobDetails extraction."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    # Pass the key only when set: an explicit key outranks a LangSmith gateway
    # key, while an omitted one lets ChatAnthropic resolve it from the env.
    key_kwargs: _ApiKeyKwargs = {}
    if api_key is not None:
        key_kwargs["api_key"] = SecretStr(api_key)
    return ChatAnthropic(
        model_name="claude-haiku-4-5-20251001",
        max_retries=2,
        # Runtime defaults; pyright reads the positional Field(None) as required.
        timeout=None,
        stop=None,
        **key_kwargs,
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
