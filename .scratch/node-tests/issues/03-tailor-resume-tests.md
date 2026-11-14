# Issue 03: Unit Tests for tailorResume Node

Status: resolved
Type: task
Blocked by: 02

## Context
The `tailorResume` node consumes the candidate's **Base Resume** (`state.rawResumeInput`) and extracted **Job Details** (`state.jobDetails`), generating the initial markdown **Resume Draft** (v1) and setting `draftVersion: 1`.

## Acceptance Criteria
- [ ] Throws an error when `state.jobDetails` is null or missing.
- [ ] Throws an error when `state.rawResumeInput` is empty.
- [ ] Invokes structured model with system prompt and formatted prompt containing **Base Resume** and **Job Details**.
- [ ] Successfully parses structured output (`TailorOutputSchema`) containing `thinking` and `resume`.
- [ ] Sets `resumeDraft` to markdown resume output and initializes `draftVersion: 1`.
- [ ] Propagates error when model call fails or output fails schema validation.

## Comments

