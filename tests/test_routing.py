"""Unit tests for after_review conditional edge routing."""

from langgraph.graph import END

from hem.graph import after_review

BASE_STATE = {
    "messages": [],
    "job_posting": "",
    "base_resume": "",
    "job_details": None,
    "resume_draft": "# My Resume\n\n...",
    "revision": 0,
    "user_feedback": None,
}


def test_routes_to_end_when_user_feedback_is_approve():
    state = {**BASE_STATE, "user_feedback": "approve"}
    assert after_review(state) == END


def test_routes_to_end_when_user_feedback_is_approve_case_insensitive():
    state = {**BASE_STATE, "user_feedback": "Approve"}
    assert after_review(state) == END


def test_routes_to_end_when_user_feedback_is_approve_with_whitespace():
    state = {**BASE_STATE, "user_feedback": "  APPROVE  "}
    assert after_review(state) == END


def test_routes_to_revise_resume_when_user_feedback_is_feedback_text():
    state = {**BASE_STATE, "user_feedback": "Make the summary shorter"}
    assert after_review(state) == "revise_resume"


def test_routes_to_end_when_user_feedback_is_none():
    state = {**BASE_STATE, "user_feedback": None}
    assert after_review(state) == END
