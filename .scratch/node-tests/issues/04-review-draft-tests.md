# Issue 04: Unit Tests for reviewDraft Node

Status: resolved
Type: task
Blocked by: 03

## Context
Per ADR-0001, the `reviewDraft` node is an idempotent review boundary separated from draft generators. It writes the generated **Resume Draft** markdown file to disk via `writeResumeDraft` and calls LangGraph `interrupt()` to await candidate **Human Review**.

## Acceptance Criteria
- [ ] Throws an error when `state.resumeDraft` or `state.jobDetails` is missing.
- [ ] Invokes `writeResumeDraft` with `resumeDraft`, `jobDetails`, and `draftVersion`.
- [ ] Calls LangGraph `interrupt()` containing draft summary, file path, and review prompt.
- [ ] Captures candidate input returned by `interrupt()` as `userFeedback` in state update.
- [ ] Does not re-invoke LLM calls during human review resume cycle.

## Comments

