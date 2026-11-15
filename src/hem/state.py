"""State definition for the Hem graph."""

from typing import Annotated

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict

from hem.types import JobDetails


class AgentState(TypedDict, total=False):
    """The central state of the resume tailoring workflow."""

    messages: Annotated[list[BaseMessage], add_messages]
    job_posting: str
    base_resume: str
    job_details: JobDetails | None
    resume_draft: str | None
    revision: int
    user_feedback: str | None
