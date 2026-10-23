# Issue 01: Unit Tests for parseJobInput Node

Status: resolved
Type: task

## Context
The `parseJobInput` node accepts candidate input for the target **Job Posting** in `state.rawJobInput`. If provided a URL, it fetches the HTML document and extracts the readable article text using `@mozilla/readability`. If given plain text, it passes the text through unchanged.

## Acceptance Criteria
- [x] Throws an error when `rawJobInput` is empty or whitespace-only.
- [x] Returns plain text unchanged when `rawJobInput` does not start with `http://` or `https://` (including non-HTTP protocols like `ftp://`).
- [x] Handles URLs with leading/trailing whitespace by trimming before URL evaluation and fetch.
- [x] Successfully fetches and strips HTML using `@mozilla/readability` when input is a valid URL.
- [x] Throws an error (`Failed to fetch job posting: ...`) when the HTTP response is not ok (e.g. 404, 500).
- [x] Throws an error when the network request fails (e.g. DNS resolution error, connection timeout).
- [x] Terminates early by throwing an error (`Failed to extract readable job posting content from URL`) when `@mozilla/readability` returns `null` or empty `textContent`.
- [x] Adheres strictly to `StateAnnotation.Update` contract by returning only `{ rawJobInput }`.

## Comments
- Simplified `fetchAndStripHtml` to terminate early by throwing when `article?.textContent` is not present, removing the body fallback.
- Added comprehensive unit tests covering all edge cases in `mainAgent/tests/nodes/parseJobInput.test.ts`.
