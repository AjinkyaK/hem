# Issue 02: Unit Tests for extractJobDetails Node

Status: resolved
Type: task
Blocked by: 01

## Context
The `extractJobDetails` node takes the normalized **Job Posting** text in `state.rawJobInput` and invokes Claude Haiku with structured output to populate `state.jobDetails` (the 14-field structured schema conforming to `JobDetailsSchema`).

## Acceptance Criteria
- [ ] Throws an error when `state.rawJobInput` is empty or whitespace-only without calling LLM.
- [ ] Passes system prompt (`extractJobDetailsSystemPrompt`) and human message (`state.rawJobInput`) to structured model.
- [ ] Returns `{ jobDetails }` object conforming to `JobDetailsSchema`.
- [ ] Validates all required fields in `JobDetailsSchema` (title, company, requiredSkills, preferredSkills, responsibilities, experienceLevel, keyThemes, locationRemotePolicy, industryDomain, softSkills, educationCertifications, companyValuesCulture, highPriorityKeywords, atsKeywords).
- [ ] Propagates error when LLM invocation or structured parsing fails.

## Comments

