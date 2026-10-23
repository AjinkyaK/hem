"""Graph construction and routing for Agentic Resume Tailor."""

from langgraph.graph import END, START, StateGraph

from agentic_resume_tailor.nodes.extract_job_details import extract_job_details
from agentic_resume_tailor.nodes.parse_job_input import parse_job_input
from agentic_resume_tailor.nodes.review_draft import review_draft
from agentic_resume_tailor.nodes.revise_resume import revise_resume
from agentic_resume_tailor.nodes.tailor_resume import tailor_resume
from agentic_resume_tailor.state import AgentState


def after_review(state: AgentState) -> str:
    """Route to revision or end based on user feedback."""
    feedback = state.get("user_feedback")
    if not feedback:
        return END
    return END if feedback.strip().lower() == "approve" else "revise_resume"


builder = StateGraph(AgentState)
builder.add_node("parse_job_input", parse_job_input)
builder.add_node("extract_job_details", extract_job_details)
builder.add_node("tailor_resume", tailor_resume)
builder.add_node("revise_resume", revise_resume)
builder.add_node("review_draft", review_draft)

builder.add_edge(START, "parse_job_input")
builder.add_edge("parse_job_input", "extract_job_details")
builder.add_edge("extract_job_details", "tailor_resume")
builder.add_edge("tailor_resume", "review_draft")
builder.add_edge("revise_resume", "review_draft")

builder.add_conditional_edges(
    "review_draft",
    after_review,
    {
        "revise_resume": "revise_resume",
        END: END,
    },
)

graph = builder.compile()
graph.name = "MainAgent"
