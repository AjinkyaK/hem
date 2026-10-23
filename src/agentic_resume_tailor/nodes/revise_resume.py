"""Node for incorporating candidate Revision Feedback into a new Resume Draft."""

import os

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig

from agentic_resume_tailor.state import AgentState


def get_chat_model():
    """Build ChatAnthropic model for draft revisions."""
    return ChatAnthropic(
        model="claude-haiku-4-5-20251001",
        api_key=os.environ.get("ANTHROPIC_API_KEY"),
        max_retries=2,
    )


async def revise_resume(
    state: AgentState,
    _config: RunnableConfig | None = None,
    model=None,
) -> dict:
    """Revise resume draft based on human feedback."""
    resume_draft = state.get("resume_draft")
    if not resume_draft:
        raise ValueError("reviseResume: resumeDraft is null")
    user_feedback = state.get("user_feedback")
    if not user_feedback:
        raise ValueError("reviseResume: userFeedback is null")
    job_details = state.get("job_details")
    if not job_details:
        raise ValueError("reviseResume: jobDetails is null")

    chat_model = model if model is not None else get_chat_model()
    result = await chat_model.ainvoke(
        [
            HumanMessage(
                content=f"Here is the current resume draft:\n\n{resume_draft}\n\nPlease make the following changes only — preserve everything else:\n{user_feedback}"
            )
        ]
    )

    new_draft = (
        result.content if isinstance(result.content, str) else str(result.content)
    )
    current_version = state.get("draft_version", 1)
    return {"resume_draft": new_draft, "draft_version": current_version + 1}
