"""Node for generating the first Resume Draft (Revision 1) via Tailoring."""

import json
import os
from typing import TypedDict, cast

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from pydantic import SecretStr

from hem.prompts.tailor_resume import (
    TAILOR_RESUME_SYSTEM_PROMPT,
)
from hem.state import AgentState
from hem.types import JobDetails, TailorOutput


class _ApiKeyKwargs(TypedDict, total=False):
    api_key: SecretStr


def get_structured_model():
    """Build structured ChatAnthropic model for TailorOutput."""
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
    ).with_structured_output(TailorOutput)


async def tailor_resume(
    state: AgentState,
    _config: RunnableConfig | None = None,
    model=None,
) -> dict:
    """Generate the initial Resume Draft from the Base Resume and Job Details."""
    base_resume = state.get("base_resume", "")
    if not base_resume or not base_resume.strip():
        raise ValueError("tailor_resume: base_resume is empty")
    job_details = state.get("job_details")
    if not job_details:
        raise ValueError("tailor_resume: job_details is null")

    if isinstance(job_details, JobDetails):
        details_str = json.dumps(job_details.model_dump(by_alias=True), indent=2)
    elif isinstance(job_details, dict):
        details_str = json.dumps(job_details, indent=2)
    else:
        details_str = str(job_details)

    structured_model = model if model is not None else get_structured_model()
    result = await structured_model.ainvoke(
        [
            SystemMessage(content=TAILOR_RESUME_SYSTEM_PROMPT),
            HumanMessage(
                content=f"Base Resume:\n{base_resume}\n\nJob Details:\n{details_str}"
            ),
        ]
    )

    resume_text = (
        result.resume
        if isinstance(result, TailorOutput)
        else cast(dict, result)["resume"]
    )
    return {"resume_draft": resume_text, "revision": 1}
