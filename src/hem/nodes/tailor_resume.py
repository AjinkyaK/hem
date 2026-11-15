"""Node for generating the first Resume Draft (Revision 1) via Tailoring."""

import json
import os

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from hem.prompts.tailor_resume import (
    TAILOR_RESUME_SYSTEM_PROMPT,
)
from hem.state import AgentState
from hem.types import JobDetails, TailorOutput


def get_structured_model():
    """Build structured ChatAnthropic model for TailorOutput."""
    return ChatAnthropic(
        model="claude-haiku-4-5-20251001",
        api_key=os.environ.get("ANTHROPIC_API_KEY"),
        max_retries=2,
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
        result.resume if isinstance(result, TailorOutput) else result["resume"]
    )
    return {"resume_draft": resume_text, "revision": 1}
