# Agentic Resume Tailor — Design Spec

**Date:** 2026-04-11  
**Stack:** LangGraph.js (TypeScript), Claude (Anthropic)

---

## Overview

A LangGraph agent that takes a user's existing resume and a job posting (URL or pasted text) and produces a tailored markdown resume. The pipeline runs deterministically, pauses for human approval, and supports targeted revision cycles before finalizing output. A separate user-owned script converts the markdown to DOCX.

---

## Inputs & Outputs

**Inputs (per session):**
- `rawJobInput`: job posting as a URL or plain text
- `rawResumeInput`: user's existing resume as plain text

**Output:**
- Tailored resume in markdown format (user's script converts to DOCX)

---

## Architecture: Option A — Linear Pipeline with Interrupt + Revision Loop

```
__start__
    │
parseJobInput        ← fetch + clean URL, or pass text through
    │
extractJobDetails    ← LLM: structured JobDetails from job text
    │
tailorResume         ← LLM: rewrites resume against JobDetails → markdown draft
    │
  [INTERRUPT]        ← surfaces draft to user
    │
    ├─ "approve" ──────────────────────────────► __end__
    │
    └─ feedback ──► reviseResume              ← LLM: targeted edit of draft
                          │
                        [INTERRUPT]           ← loops until approved
```

---

## State

```typescript
// src/agent/types.ts
interface JobDetails {
  title: string;
  company: string;
  requiredSkills: string[];
  preferredSkills: string[];
  responsibilities: string[];
  experienceLevel: string;
  keyThemes: string[];
}
```

```typescript
// src/agent/state.ts
StateAnnotation = {
  messages: BaseMessage[];        // interrupt/revision conversation history
  rawJobInput: string;            // URL or pasted job posting text
  rawResumeInput: string;         // user's original resume text
  jobDetails: JobDetails | null;  // structured output of extractJobDetails
  resumeDraft: string | null;     // current markdown draft, updated each revision
}
```

`messages` uses the append-only `messagesStateReducer`. All other fields use simple overwrite semantics.

---

## Nodes

### `parseJobInput`

- No LLM call
- If `rawJobInput` starts with `http`, fetches the page and strips HTML to plain text (`@mozilla/readability` + `jsdom`)
- If plain text, passes through unchanged
- Writes cleaned text back to `rawJobInput`
- On fetch failure: throws with a descriptive error — no silent fallback

### `extractJobDetails`

- **System prompt:** instructs structured extraction behavior (role, output format, constraints)
- **User message:** cleaned job posting text
- Uses `withStructuredOutput(JobDetailsSchema)` (Zod) — typed, validated, no manual JSON parsing
- Zod validation failure: retries once, then throws
- Writes result to `jobDetails`

### `tailorResume`

- **System prompt:** rewriting rules — mirror job language/priorities, reorder bullets to front-load relevance, do not fabricate experience, output clean markdown
- **User message:** original resume text + serialized `jobDetails`
- Writes markdown output to `resumeDraft`
- Calls `interrupt()` immediately after writing — surfaces draft to user

### *(interrupt — routing)*

After the user responds, the graph resumes. A conditional edge checks the last human message:

```typescript
const afterInterrupt = (state): "reviseResume" | "__end__" => {
  const feedback = lastHumanMessage(state).content.trim().toLowerCase();
  return feedback === "approve" ? "__end__" : "reviseResume";
};
```

### `reviseResume`

- No system prompt
- **User message:** current `resumeDraft` + user's feedback text (constructed inline in node)
- Makes only the changes described in the feedback, preserves everything else
- Writes updated draft back to `resumeDraft`
- Calls `interrupt()` again — loops until user approves

---

## File Layout

```
src/agent/
  graph.ts              ← graph definition and compilation
  state.ts              ← StateAnnotation
  types.ts              ← JobDetails interface, Zod schema
  nodes/
    parseJobInput.ts
    extractJobDetails.ts
    tailorResume.ts
    reviseResume.ts
  prompts/
    extractJobDetails.ts  ← system prompt string
    tailorResume.ts       ← system prompt string
```

---

## Error Handling

- `parseJobInput`: URL fetch failure throws immediately with a descriptive message
- `extractJobDetails`: Zod validation failure retries once, then throws — never passes partial/invalid job details downstream
- All nodes: fail loudly rather than silently — no fallback values that leave state in an ambiguous condition

---

## Out of Scope

- DOCX conversion (handled by user's existing script, invoked manually after agent outputs markdown)
- Job search / job discovery
- Resume storage or multi-resume management
- Authentication or multi-user support
