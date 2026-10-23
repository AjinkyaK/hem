"""State definition for the Agentic Resume Tailor graph."""

from typing import Annotated

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict

from agentic_resume_tailor.types import JobDetails


class AgentState(TypedDict, total=False):
    """The central state of the resume tailoring workflow."""

    messages: Annotated[list[BaseMessage], add_messages]
    raw_job_input: str
    raw_resume_input: str
    job_details: JobDetails | None
    resume_draft: str | None
    draft_version: int
    user_feedback: str | None
