# Issue 06: Unit Tests for afterReview Conditional Edge

Status: resolved
Type: task
Blocked by: 04

## Context
The `afterReview` routing function evaluates candidate input following **Human Review** on the `reviewDraft` node to determine the next graph step.

## Acceptance Criteria
- [ ] Routes to `"__end__"` when `state.userFeedback` is null or undefined.
- [ ] Routes to `"__end__"` when `state.userFeedback` is `"approve"` (case-insensitive, trims whitespace).
- [ ] Routes to `"reviseResume"` when `state.userFeedback` contains revision feedback (any string other than `"approve"`).
- [ ] Handles leading/trailing whitespace properly (e.g. `"  approve  "` routes to `"__end__"`).

## Comments

