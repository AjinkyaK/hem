# Spec: Graph Node Test Coverage

## Overview
Comprehensive, unit-isolated test suites for each node and routing function in the LangGraph workflow (`mainAgent/src/agent/graph.ts`).

The LangGraph agent automates the alignment of a candidate's **Base Resume** to a **Job Posting** through a structured pipeline:
1. `parseJobInput`: Ingests and normalizes the target **Job Posting** from a URL or raw text.
2. `extractJobDetails`: Extracts a structured 14-field **Job Details** object using structured LLM output.
3. `tailorResume`: Generates initial **Resume Draft** (v1) tailored to the **Job Details**.
4. `reviewDraft`: Saves the markdown draft to disk and triggers **Human Review** via `interrupt()`.
5. `reviseResume`: Generates an updated **Resume Draft** incorporating candidate **Revision Feedback**.
6. `afterReview`: Conditional routing function determining whether to revise or finish (`__end__`).

## Goals
- Ensure each graph node has unit tests with offline ESM mocking (`jest.unstable_mockModule`).
- Verify contract compliance with `StateAnnotation.Update` (no state pollution or unhandled mutations).
- Validate deterministic edge-case and failure handling (missing inputs, extraction failures, schema rejections).
- Keep node test execution fast and offline under `npm test` / `yarn test`.

## Issue Tickets
- `01-parse-job-input-tests.md`: Test URL fetching, HTML article parsing with Readability, early termination on extraction failure, and plain text passthrough.
- `02-extract-job-details-tests.md`: Test LLM structured extraction invocation, system prompt formatting, schema validation, and missing input rejection.
- `03-tailor-resume-tests.md`: Test resume generation, structured output schema, prompt inputs, and fallback/error paths.
- `04-review-draft-tests.md`: Test disk writing via `writeResumeDraft`, `interrupt()` trigger for **Human Review**, draft version tracking, and feedback capture.
- `05-revise-resume-tests.md`: Test revision generation incorporating **Revision Feedback**, version incrementing, and preservation of prior context.
- `06-after-review-routing-tests.md`: Test conditional edge evaluation for approvals, revision requests, whitespace, and null feedback.

