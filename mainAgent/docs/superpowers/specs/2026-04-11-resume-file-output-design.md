# Resume File Output Design

**Date:** 2026-04-11
**Status:** Approved

## Overview

When the agent generates or revises a tailored resume, write it to a markdown file on disk and surface the file path via `interrupt()` instead of dumping the full resume text into the LangGraph Studio UI. Users open the file in their editor to review, then respond with "approve" or feedback.

## Output Directory and File Naming

- **Directory:** `~/ajinkyakale/TailoredResumes/` (resolved via `os.homedir()`)
- **Filename pattern:** `{company}_{title}_{YYYY-MM-DD}_v{N}.md`
  - `company` and `title` are slugified from `jobDetails` (lowercase, spaces → underscores, special chars stripped)
  - Date is the local date at write time
  - `N` is the draft version number, starting at 1
- Example: `stripe_senior_software_engineer_2026-04-11_v1.md`
- Each revision creates a new versioned file; previous versions are preserved

## State Changes

Add `draftVersion: number` to `StateAnnotation`:

```ts
draftVersion: Annotation<number>({
  default: () => 0,
  reducer: (_, b) => b,
});
```

`tailorResume` sets `draftVersion: 1`. `reviseResume` sets `draftVersion: state.draftVersion + 1`.

## New Helper: `writeResumeDraft`

**File:** `src/agent/utils/writeResumeDraft.ts`

**Signature:** `writeResumeDraft(draft: string, jobDetails: JobDetails, version: number): string`

**Responsibilities:**

1. Slugify `jobDetails.company` and `jobDetails.title`
2. Build the filename and resolve the full path under `~/ajinkyakale/TailoredResumes/`
3. Create the directory if it doesn't exist (`fs.mkdirSync` with `recursive: true`)
4. Write the file synchronously
5. Return the absolute path

## Node Changes

### `tailorResume`

- After generating `draft`, call `writeResumeDraft(draft, state.jobDetails, 1)`
- `interrupt()` with: `"Draft written to: <path>\n\nType 'approve' to finalize, or provide feedback to revise."`
- Return `{ resumeDraft: draft, userFeedback, draftVersion: 1 }`

### `reviseResume`

- After generating `newDraft`, call `writeResumeDraft(newDraft, state.jobDetails, state.draftVersion + 1)`
- Same interrupt message format with updated path
- Return `{ resumeDraft: newDraft, userFeedback, draftVersion: state.draftVersion + 1 }`

## Files Changed

| File                                  | Change                                                       |
| ------------------------------------- | ------------------------------------------------------------ |
| `src/agent/state.ts`                  | Add `draftVersion` field                                     |
| `src/agent/utils/writeResumeDraft.ts` | New helper (create)                                          |
| `src/agent/nodes/tailorResume.ts`     | Call helper, update interrupt message, return `draftVersion` |
| `src/agent/nodes/reviseResume.ts`     | Call helper, update interrupt message, return `draftVersion` |

No changes to `graph.ts` or routing logic.
