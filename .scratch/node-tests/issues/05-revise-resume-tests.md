# Issue 05: Unit Tests for reviseResume Node

Status: ready-for-agent
Type: task
Blocked by: 04

## Context
The `reviseResume` node is triggered when the candidate provides **Revision Feedback** during **Human Review**. It prompts the LLM with the **Base Resume**, **Job Details**, previous **Resume Draft**, and candidate **Revision Feedback**, generating a revised draft and incrementing `draftVersion`.

## Acceptance Criteria
- [ ] Throws an error when `state.userFeedback` is null or empty.
- [ ] Throws an error when previous `state.resumeDraft` or `state.jobDetails` is missing.
- [ ] Passes revision prompt including feedback, prior draft, and job requirements to LLM.
- [ ] Updates `resumeDraft` with revised markdown and increments `draftVersion` (e.g. from 1 to 2).
- [ ] Resets or clears feedback field as appropriate for subsequent review cycle.

## Comments

