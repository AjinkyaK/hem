# Agentic Resume Tailor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a LangGraph agent that takes a job posting (URL or text) and an existing resume, tailors the resume to match the job in markdown format, and allows human review/revision before finalizing.

**Architecture:** Linear deterministic pipeline — `parseJobInput → extractJobDetails → tailorResume → [interrupt] → reviseResume → [interrupt]` — with a conditional edge after each interrupt that routes to `reviseResume` on feedback or `__end__` on approval.

**Tech Stack:** LangGraph.js (TypeScript), `@langchain/anthropic` (Claude), Zod v4 (structured output), `@mozilla/readability` + `jsdom` (HTML stripping), Jest (tests)

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/agent/types.ts` | Create | `JobDetails` interface + Zod schema |
| `src/agent/state.ts` | Rewrite | Add `rawJobInput`, `rawResumeInput`, `jobDetails`, `resumeDraft`, `userFeedback` |
| `src/agent/prompts/extractJobDetails.ts` | Create | System prompt for structured extraction node |
| `src/agent/prompts/tailorResume.ts` | Create | System prompt for resume tailoring node |
| `src/agent/nodes/parseJobInput.ts` | Create | Fetch URL or pass text through |
| `src/agent/nodes/extractJobDetails.ts` | Create | LLM structured extraction with Zod |
| `src/agent/nodes/tailorResume.ts` | Create | LLM rewrite + interrupt |
| `src/agent/nodes/reviseResume.ts` | Create | LLM revision + interrupt |
| `src/agent/graph.ts` | Rewrite | Wire all nodes, edges, conditional routing |
| `tests/nodes/parseJobInput.test.ts` | Create | Unit tests for URL/text handling |
| `tests/nodes/extractJobDetails.test.ts` | Create | Unit tests for Zod schema validation |
| `tests/nodes/routing.test.ts` | Create | Unit tests for afterReview routing logic |

---

## Task 1: Install dependencies

**Files:**
- Modify: `mainAgent/package.json` (via yarn)

- [ ] **Step 1: Install packages**

Run from `mainAgent/`:
```bash
yarn add @mozilla/readability jsdom
yarn add --dev @types/jsdom
```

- [ ] **Step 2: Verify install**

```bash
yarn tsc --noEmit
```
Expected: no errors (existing files compile cleanly)

- [ ] **Step 3: Commit**

```bash
git add package.json yarn.lock
git commit -m "chore: add readability and jsdom dependencies"
```

---

## Task 2: Define types and Zod schema

**Files:**
- Create: `mainAgent/src/agent/types.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/agent/types.ts
import { z } from "zod";

export const JobDetailsSchema = z.object({
  title: z.string(),
  company: z.string(),
  requiredSkills: z.array(z.string()),
  preferredSkills: z.array(z.string()),
  responsibilities: z.array(z.string()),
  experienceLevel: z.string(),
  keyThemes: z.array(z.string()),
});

export type JobDetails = z.infer<typeof JobDetailsSchema>;
```

- [ ] **Step 2: Verify it compiles**

```bash
yarn tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/agent/types.ts
git commit -m "feat: add JobDetails type and Zod schema"
```

---

## Task 3: Update state

**Files:**
- Rewrite: `mainAgent/src/agent/state.ts`

- [ ] **Step 1: Rewrite state.ts**

```typescript
// src/agent/state.ts
import { BaseMessage, BaseMessageLike } from "@langchain/core/messages";
import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import { JobDetails } from "./types.js";

export const StateAnnotation = Annotation.Root({
  // Conversation thread — append-only
  messages: Annotation<BaseMessage[], BaseMessageLike[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  // Pipeline inputs — provided at graph invocation
  rawJobInput: Annotation<string>({
    default: () => "",
    reducer: (_, b) => b,
  }),
  rawResumeInput: Annotation<string>({
    default: () => "",
    reducer: (_, b) => b,
  }),
  // Pipeline stage outputs — overwrite each time
  jobDetails: Annotation<JobDetails | null>({
    default: () => null,
    reducer: (_, b) => b,
  }),
  resumeDraft: Annotation<string | null>({
    default: () => null,
    reducer: (_, b) => b,
  }),
  // Set by interrupt return value — user's "approve" or feedback text
  userFeedback: Annotation<string | null>({
    default: () => null,
    reducer: (_, b) => b,
  }),
});
```

- [ ] **Step 2: Verify it compiles**

```bash
yarn tsc --noEmit
```
Expected: no errors (graph.ts will have errors — that's fine, it uses old node names)

- [ ] **Step 3: Commit**

```bash
git add src/agent/state.ts
git commit -m "feat: update state with pipeline fields"
```

---

## Task 4: Write prompts

**Files:**
- Create: `mainAgent/src/agent/prompts/extractJobDetails.ts`
- Create: `mainAgent/src/agent/prompts/tailorResume.ts`

- [ ] **Step 1: Create extractJobDetails prompt**

```typescript
// src/agent/prompts/extractJobDetails.ts
export const extractJobDetailsSystemPrompt = `You are a precise job posting analyst.

Your task is to extract structured information from a job posting. Extract exactly what is stated — do not infer or embellish.

Rules:
- requiredSkills: only skills explicitly marked as required, must-have, or listed under qualifications/requirements
- preferredSkills: skills marked as preferred, nice-to-have, or listed as a bonus
- responsibilities: 3-7 key responsibilities, each as a concise phrase (not full sentences)
- experienceLevel: one of "entry", "mid", "senior", "staff", "principal", "executive"
- keyThemes: 2-5 overarching themes (e.g. "cross-functional collaboration", "distributed systems", "data-driven decision making")
- If a field cannot be determined from the posting, use an empty array or "unknown"`;
```

- [ ] **Step 2: Create tailorResume prompt**

```typescript
// src/agent/prompts/tailorResume.ts
export const tailorResumeSystemPrompt = `You are an expert resume writer specializing in tailoring resumes to specific job postings.

Given a candidate's original resume and structured job details, rewrite the resume to maximize relevance to this specific role.

Rules:
- Mirror language and terminology from the job posting (especially requiredSkills and keyThemes)
- Reorder bullet points within each role to front-load the most relevant experience
- Rewrite bullet points to emphasize impact that aligns with the job's responsibilities
- Do NOT fabricate experience, skills, or achievements that are not in the original resume
- Do NOT remove entire roles or education entries
- Preserve all section headings (Summary, Experience, Education, Skills, etc.)
- Output clean markdown: use ## for section headings, ### for role titles, and - for bullets
- The output should be the complete tailored resume — nothing else, no commentary`;
```

- [ ] **Step 3: Verify compile**

```bash
yarn tsc --noEmit
```
Expected: no errors in new files

- [ ] **Step 4: Commit**

```bash
git add src/agent/prompts/
git commit -m "feat: add system prompts for extraction and tailoring nodes"
```

---

## Task 5: Implement extractJobDetails node

**Files:**
- Create: `mainAgent/src/agent/nodes/extractJobDetails.ts`
- Create: `mainAgent/tests/nodes/extractJobDetails.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/nodes/extractJobDetails.test.ts
import { describe, it, expect } from "@jest/globals";
import { JobDetailsSchema } from "../../src/agent/types.js";

describe("JobDetailsSchema", () => {
  it("validates a complete valid JobDetails object", () => {
    const result = JobDetailsSchema.safeParse({
      title: "Senior Engineer",
      company: "Acme Corp",
      requiredSkills: ["Python", "SQL"],
      preferredSkills: ["Kubernetes"],
      responsibilities: ["Build APIs", "Review code"],
      experienceLevel: "senior",
      keyThemes: ["data-driven", "cross-functional"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const result = JobDetailsSchema.safeParse({
      title: "Engineer",
      // missing all other fields
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-array skills fields", () => {
    const result = JobDetailsSchema.safeParse({
      title: "Engineer",
      company: "Acme",
      requiredSkills: "Python",  // should be array
      preferredSkills: [],
      responsibilities: [],
      experienceLevel: "mid",
      keyThemes: [],
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
yarn test --testPathPattern=extractJobDetails
```
Expected: FAIL — `JobDetailsSchema` not yet exported from types (or passes if types.ts is already done — run to confirm)

- [ ] **Step 3: Create the node**

```typescript
// src/agent/nodes/extractJobDetails.ts
import { RunnableConfig } from "@langchain/core/runnables";
import { ChatAnthropic } from "@langchain/anthropic";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { StateAnnotation } from "../state.js";
import { JobDetailsSchema } from "../types.js";
import { extractJobDetailsSystemPrompt } from "../prompts/extractJobDetails.js";

export const extractJobDetails = async (
  state: typeof StateAnnotation.State,
  _config: RunnableConfig,
): Promise<typeof StateAnnotation.Update> => {
  const model = new ChatAnthropic({
    model: "claude-3-5-haiku-20241022",
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const structuredModel = model.withStructuredOutput(JobDetailsSchema);

  let jobDetails;
  try {
    jobDetails = await structuredModel.invoke([
      new SystemMessage(extractJobDetailsSystemPrompt),
      new HumanMessage(state.rawJobInput),
    ]);
  } catch {
    // Retry once on structured output failure
    jobDetails = await structuredModel.invoke([
      new SystemMessage(extractJobDetailsSystemPrompt),
      new HumanMessage(state.rawJobInput),
    ]);
  }

  return { jobDetails };
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
yarn test --testPathPattern=extractJobDetails
```
Expected: PASS (3 tests)

- [ ] **Step 5: Verify compile**

```bash
yarn tsc --noEmit
```
Expected: no errors in node file

- [ ] **Step 6: Commit**

```bash
git add src/agent/nodes/extractJobDetails.ts src/agent/prompts/extractJobDetails.ts tests/nodes/extractJobDetails.test.ts
git commit -m "feat: add extractJobDetails node with Zod structured output"
```

---

## Task 6: Implement tailorResume node

**Files:**
- Create: `mainAgent/src/agent/nodes/tailorResume.ts`

- [ ] **Step 1: Create the node**

```typescript
// src/agent/nodes/tailorResume.ts
import { RunnableConfig } from "@langchain/core/runnables";
import { ChatAnthropic } from "@langchain/anthropic";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { interrupt } from "@langchain/langgraph";
import { StateAnnotation } from "../state.js";
import { tailorResumeSystemPrompt } from "../prompts/tailorResume.js";

export const tailorResume = async (
  state: typeof StateAnnotation.State,
  _config: RunnableConfig,
): Promise<typeof StateAnnotation.Update> => {
  const model = new ChatAnthropic({
    model: "claude-3-5-haiku-20241022",
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const result = await model.invoke([
    new SystemMessage(tailorResumeSystemPrompt),
    new HumanMessage(
      `Original Resume:\n${state.rawResumeInput}\n\nJob Details:\n${JSON.stringify(state.jobDetails, null, 2)}`,
    ),
  ]);

  const draft = typeof result.content === "string"
    ? result.content
    : JSON.stringify(result.content);

  // Pause execution and surface draft to the user.
  // Returns the user's response when the graph is resumed via Command({ resume: "..." }).
  const userFeedback = interrupt(draft) as string;

  return { resumeDraft: draft, userFeedback };
};
```

- [ ] **Step 2: Verify compile**

```bash
yarn tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/agent/nodes/tailorResume.ts
git commit -m "feat: add tailorResume node with interrupt"
```

---

## Task 7: Implement parseJobInput node

**Files:**
- Create: `mainAgent/src/agent/nodes/parseJobInput.ts`
- Create: `mainAgent/tests/nodes/parseJobInput.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/nodes/parseJobInput.test.ts
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// Mock fetch before importing the node
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import { parseJobInput } from "../../src/agent/nodes/parseJobInput.js";

const baseState = {
  messages: [],
  rawJobInput: "",
  rawResumeInput: "My resume content",
  jobDetails: null,
  resumeDraft: null,
  userFeedback: null,
};

describe("parseJobInput", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns plain text unchanged when not a URL", async () => {
    const state = { ...baseState, rawJobInput: "Senior Engineer at Acme Corp..." };
    const result = await parseJobInput(state, {});
    expect(result.rawJobInput).toBe("Senior Engineer at Acme Corp...");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fetches and strips HTML when input is a URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => "<html><body><article><p>Job posting text here</p></article></body></html>",
    } as unknown as Response);

    const state = { ...baseState, rawJobInput: "https://jobs.example.com/posting/123" };
    const result = await parseJobInput(state, {});
    expect(mockFetch).toHaveBeenCalledWith("https://jobs.example.com/posting/123");
    expect(typeof result.rawJobInput).toBe("string");
    expect((result.rawJobInput as string).length).toBeGreaterThan(0);
  });

  it("throws when fetch fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    } as unknown as Response);

    const state = { ...baseState, rawJobInput: "https://jobs.example.com/missing" };
    await expect(parseJobInput(state, {})).rejects.toThrow("Failed to fetch job posting");
  });

  it("throws when rawJobInput is empty", async () => {
    const state = { ...baseState, rawJobInput: "" };
    await expect(parseJobInput(state, {})).rejects.toThrow("rawJobInput is required");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
yarn test --testPathPattern=parseJobInput
```
Expected: FAIL — `parseJobInput` not found

- [ ] **Step 3: Create the node**

```typescript
// src/agent/nodes/parseJobInput.ts
import { RunnableConfig } from "@langchain/core/runnables";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { StateAnnotation } from "../state.js";

const isUrl = (input: string): boolean =>
  input.trimStart().startsWith("http://") || input.trimStart().startsWith("https://");

const fetchAndStripHtml = async (url: string): Promise<string> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch job posting: ${response.status} ${response.statusText}`);
  }
  const html = await response.text();
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  return article?.textContent?.trim() ?? dom.window.document.body.textContent?.trim() ?? "";
};

export const parseJobInput = async (
  state: typeof StateAnnotation.State,
  _config: RunnableConfig,
): Promise<typeof StateAnnotation.Update> => {
  if (!state.rawJobInput || state.rawJobInput.trim() === "") {
    throw new Error("rawJobInput is required");
  }

  if (!isUrl(state.rawJobInput)) {
    return { rawJobInput: state.rawJobInput };
  }

  const text = await fetchAndStripHtml(state.rawJobInput);
  return { rawJobInput: text };
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
yarn test --testPathPattern=parseJobInput
```
Expected: PASS (4 tests)

- [ ] **Step 5: Verify compile**

```bash
yarn tsc --noEmit
```
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/agent/nodes/parseJobInput.ts tests/nodes/parseJobInput.test.ts
git commit -m "feat: add parseJobInput node with URL fetch and HTML stripping"
```

---

## Task 8: Implement reviseResume node

**Files:**
- Create: `mainAgent/src/agent/nodes/reviseResume.ts`

- [ ] **Step 1: Create the node**

```typescript
// src/agent/nodes/reviseResume.ts
import { RunnableConfig } from "@langchain/core/runnables";
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage } from "@langchain/core/messages";
import { interrupt } from "@langchain/langgraph";
import { StateAnnotation } from "../state.js";

export const reviseResume = async (
  state: typeof StateAnnotation.State,
  _config: RunnableConfig,
): Promise<typeof StateAnnotation.Update> => {
  const model = new ChatAnthropic({
    model: "claude-3-5-haiku-20241022",
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const result = await model.invoke([
    new HumanMessage(
      `Here is the current resume draft:\n\n${state.resumeDraft}\n\nPlease make the following changes only — preserve everything else:\n${state.userFeedback}`,
    ),
  ]);

  const newDraft = typeof result.content === "string"
    ? result.content
    : JSON.stringify(result.content);

  // Surface the revised draft and wait for another round of approval or feedback.
  const userFeedback = interrupt(newDraft) as string;

  return { resumeDraft: newDraft, userFeedback };
};
```

- [ ] **Step 2: Verify compile**

```bash
yarn tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/agent/nodes/reviseResume.ts
git commit -m "feat: add reviseResume node with interrupt"
```

---

## Task 9: Wire up graph and add routing test

**Files:**
- Rewrite: `mainAgent/src/agent/graph.ts`
- Create: `mainAgent/tests/nodes/routing.test.ts`

- [ ] **Step 1: Write the failing routing test**

```typescript
// tests/nodes/routing.test.ts
import { describe, it, expect } from "@jest/globals";
import { afterReview } from "../../src/agent/graph.js";
import { BaseMessage } from "@langchain/core/messages";

const baseState = {
  messages: [] as BaseMessage[],
  rawJobInput: "",
  rawResumeInput: "",
  jobDetails: null,
  resumeDraft: "# My Resume\n\n...",
  userFeedback: null,
};

describe("afterReview routing", () => {
  it("routes to __end__ when userFeedback is 'approve'", () => {
    const result = afterReview({ ...baseState, userFeedback: "approve" });
    expect(result).toBe("__end__");
  });

  it("routes to __end__ when userFeedback is 'Approve' (case insensitive)", () => {
    const result = afterReview({ ...baseState, userFeedback: "Approve" });
    expect(result).toBe("__end__");
  });

  it("routes to __end__ when userFeedback is 'APPROVE' with whitespace", () => {
    const result = afterReview({ ...baseState, userFeedback: "  APPROVE  " });
    expect(result).toBe("__end__");
  });

  it("routes to reviseResume when userFeedback is feedback text", () => {
    const result = afterReview({ ...baseState, userFeedback: "Make the summary shorter" });
    expect(result).toBe("reviseResume");
  });

  it("routes to __end__ when userFeedback is null (no feedback provided)", () => {
    const result = afterReview({ ...baseState, userFeedback: null });
    expect(result).toBe("__end__");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
yarn test --testPathPattern=routing
```
Expected: FAIL — `afterReview` not exported from graph.ts

- [ ] **Step 3: Rewrite graph.ts**

```typescript
// src/agent/graph.ts
import { StateGraph } from "@langchain/langgraph";
import { StateAnnotation } from "./state.js";
import { parseJobInput } from "./nodes/parseJobInput.js";
import { extractJobDetails } from "./nodes/extractJobDetails.js";
import { tailorResume } from "./nodes/tailorResume.js";
import { reviseResume } from "./nodes/reviseResume.js";

export const afterReview = (
  state: typeof StateAnnotation.State,
): "reviseResume" | "__end__" => {
  if (!state.userFeedback) return "__end__";
  return state.userFeedback.trim().toLowerCase() === "approve"
    ? "__end__"
    : "reviseResume";
};

const builder = new StateGraph(StateAnnotation)
  .addNode("parseJobInput", parseJobInput)
  .addNode("extractJobDetails", extractJobDetails)
  .addNode("tailorResume", tailorResume)
  .addNode("reviseResume", reviseResume)
  .addEdge("__start__", "parseJobInput")
  .addEdge("parseJobInput", "extractJobDetails")
  .addEdge("extractJobDetails", "tailorResume")
  .addConditionalEdges("tailorResume", afterReview)
  .addConditionalEdges("reviseResume", afterReview);

export const graph = builder.compile();
graph.name = "MainAgent";
```

- [ ] **Step 4: Run routing test to verify it passes**

```bash
yarn test --testPathPattern=routing
```
Expected: PASS (5 tests)

- [ ] **Step 5: Run all unit tests**

```bash
yarn test
```
Expected: all tests pass (routing + parseJobInput + extractJobDetails schema tests)

- [ ] **Step 6: Verify full compile**

```bash
yarn tsc --noEmit
```
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/agent/graph.ts tests/nodes/routing.test.ts
git commit -m "feat: wire up full pipeline graph with routing"
```

---

## Task 10: Verify server starts

**Files:** none — smoke test only

- [ ] **Step 1: Start the LangGraph dev server**

Run from `mainAgent/`:
```bash
npx @langchain/langgraph-cli dev
```
Expected: server starts without errors, prints something like:
```
Ready! - API: http://localhost:2024
```

- [ ] **Step 2: Check graph is accessible**

In a separate terminal:
```bash
curl http://localhost:2024/info
```
Expected: JSON response listing `MainAgent` graph

- [ ] **Step 3: Stop server and commit final state**

```bash
git add -A
git status  # verify nothing unexpected is staged
git commit -m "feat: complete agentic resume tailor pipeline"
```

---

## Self-Review Notes

- **Spec coverage:** All nodes from spec implemented. Interrupt loop covered. URL fetch + text passthrough covered. Zod structured output covered. System prompts for `extractJobDetails` and `tailorResume` only. `reviseResume` has no system prompt (per spec). DOCX conversion explicitly out of scope.
- **`userFeedback` field:** Added to state as an implementation detail not in the spec — required for `interrupt()` return value to reach the routing function.
- **Type consistency:** `afterReview` uses `StateAnnotation.State` throughout. `JobDetails` type flows from `types.ts` → `state.ts` → node files consistently. `resumeDraft` and `userFeedback` are `string | null` in state and handled in all nodes.
- **No placeholders:** All steps contain complete code.
