"""Node for writing draft to disk and pausing execution for Human Review."""

from langchain_core.runnables import RunnableConfig
from langgraph.types import interrupt

from agentic_resume_tailor.state import AgentState
from agentic_resume_tailor.utils.write_resume_draft import write_resume_draft


async def review_draft(
    state: AgentState,
    _config: RunnableConfig | None = None,
    writer_func=None,
    interrupt_func=None,
) -> dict:
    """Save draft to disk and trigger human-in-the-loop interrupt."""
    resume_draft = state.get("resume_draft")
    if not resume_draft:
        raise ValueError("reviewDraft: resumeDraft is null")
    job_details = state.get("job_details")
    if not job_details:
        raise ValueError("reviewDraft: jobDetails is null")

    writer = writer_func if writer_func is not None else write_resume_draft
    do_interrupt = interrupt_func if interrupt_func is not None else interrupt

    file_path = writer(
        resume_draft,
        job_details,
        state.get("draft_version", 1),
    )

    user_feedback = do_interrupt(
        f"Draft written to: {file_path}\n\nType 'approve' to finalize, or provide feedback to revise."
    )

    return {"user_feedback": user_feedback}
