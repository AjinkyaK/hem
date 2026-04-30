# LangGraph Interrupt Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate duplicate LLM execution on interrupt resume by splitting the LLM-bearing nodes (`tailorResume`, `reviseResume`) from a new shared `reviewDraft` node that owns the file write and `interrupt()` call.

**Architecture:** Apply the LangGraph-recommended split-node pattern. LangGraph re-runs the node containing `interrupt()` on resume but does **not** re-run upstream nodes — so the LLM call moves upstream and the new `reviewDraft` node becomes a provably-idempotent waiter. Filename non-determinism (the `new Date()` call) is removed from `writeResumeDraft` so the replay write is a true no-op.

**Tech Stack:** TypeScript, LangGraph (`@langchain/langgraph`), Jest with `unstable_mockModule` for ESM mocks, Yarn.

**Spec:** `docs/superpowers/specs/2026-04-27-langgraph-interrupt-redesign-design.md`

---

## Execution Status (as of 2026-04-29)

| Task | Status | Commit(s) |
|---|---|---|
| Task 1: Drop date from `writeResumeDraft` | ✅ Done | `931ac9a` |
| Test-infra side fix: `jest.mock` → `unstable_mockModule` (parseJobInput.test.ts, routing.test.ts) | ✅ Done | `acdee72` |
| Plan update: Task 5 mock pattern → `unstable_mockModule` | ✅ Done | `e3412ba` |
| Task 2: Create `reviewDraft` node + tests | ✅ Done | `97ac00a` (+ test-quality fix `b399668`) |
| Task 3: Strip file write + interrupt from `tailorResume` | ✅ Done | `3e1a7f7` |
| Task 4: Strip file write + interrupt from `reviseResume` | ✅ Done | `d1c2444` (+ mock-signature fix `7c47ee9`) |
| Task 5: Wire `reviewDraft` into the graph | ✅ Done | `e789fb5` (+ format passes `deb38c2`, `7154255`) |
| Task 6: End-to-end smoke verification | ✅ Done | — (verification only; no commit) |
| Final code review across all tasks | ✅ Done — APPROVED FOR MERGE | — |

**Resumption notes:** Redesign complete. HEAD: `7154255`. 46/46 tests passing, lint clean, format clean, build clean. Single `interrupt()` call site (`reviewDraft.ts`); `tailorResume` and `reviseResume` are pure transforms. Final reviewer flagged minor polish items (commit-log squashing for log hygiene, an idempotency-test comment) — none blocking. Ready to merge.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `mainAgent/src/agent/utils/writeResumeDraft.ts` | Modify | Drop date segment from filename |
| `mainAgent/tests/utils/writeResumeDraft.test.ts` | Modify | Update filename-format assertions |
| `mainAgent/src/agent/nodes/reviewDraft.ts` | Create | Shared review node: file write + `interrupt()` |
| `mainAgent/tests/nodes/reviewDraft.test.ts` | Create | Unit tests for `reviewDraft` incl. idempotency |
| `mainAgent/src/agent/nodes/tailorResume.ts` | Modify | Strip file write + `interrupt()`; return draft + version only |
| `mainAgent/tests/nodes/tailorResume.test.ts` | Modify | Update for stripped contract |
| `mainAgent/src/agent/nodes/reviseResume.ts` | Modify | Strip file write + `interrupt()`; return draft + version only |
| `mainAgent/tests/nodes/reviseResume.test.ts` | Create | Unit tests for the stripped revise node |
| `mainAgent/src/agent/graph.ts` | Modify | Register `reviewDraft`; reroute edges |
| `mainAgent/tests/nodes/routing.test.ts` | Modify | Add mock for new `reviewDraft.js` module |

**State (`mainAgent/src/agent/state.ts`):** No changes.

---

## Conventions

- **Working directory for all yarn commands:** `mainAgent/`. Run as `cd mainAgent && yarn <cmd>` or change into the directory once.
- **Test command:** `yarn test` (Jest, ESM mode).
- **Lint command:** `yarn lint`.
- **Format check:** `yarn format:check`.
- **Commit style:** conventional commits (`feat:`, `fix:`, `refactor:`, `test:`).
- **Do not touch** the uncommitted working-tree edits in `extractJobDetails.ts`, `reviseResume.ts`, `tailorResume.ts`, `.gitignore` (model-ID bumps unrelated to this work) beyond what tasks below explicitly require.

---

### Task 1: Drop date from `writeResumeDraft` filename

**Files:**
- Modify: `mainAgent/src/agent/utils/writeResumeDraft.ts:28-29`
- Modify: `mainAgent/tests/utils/writeResumeDraft.test.ts:49-66`

- [x] **Step 1: Update the filename test to expect the new format (no date)**

Open `mainAgent/tests/utils/writeResumeDraft.test.ts`. Make two edits:

**(a)** Replace the body of the existing `it("slugifies company and title into the filename", ...)` test (lines ~49-53) with a stricter full-filename match:

```ts
  it("slugifies company and title into the filename", () => {
    const filePath = writeResumeDraft("# Resume", jobDetails, 1, tmpDir);
    const filename = path.basename(filePath);
    expect(filename).toBe("stripe_inc_senior_software_engineer_v1.md");
  });
```

**(b)** Delete the entire `it("includes today's date in the filename", ...)` test (lines ~61-66). Date is no longer in the filename.

- [x] **Step 2: Add an idempotency test for `writeResumeDraft`**

Append to the `describe("writeResumeDraft", ...)` block in `mainAgent/tests/utils/writeResumeDraft.test.ts`:

```ts
  it("is idempotent: same inputs produce same path and same contents", () => {
    const path1 = writeResumeDraft("# Resume", jobDetails, 1, tmpDir);
    const path2 = writeResumeDraft("# Resume", jobDetails, 1, tmpDir);
    expect(path1).toBe(path2);
    expect(fs.readFileSync(path2, "utf-8")).toBe("# Resume");
  });
```

- [x] **Step 3: Run the test to confirm it fails**

```bash
cd mainAgent && yarn test --testPathPatterns=writeResumeDraft.test.ts
```

Expected: failures on the new "slugifies" assertion (filename still contains date) and the idempotency assertion is fine — but the `it("includes the version number in the filename", ...)` test still passes (it only checks the suffix). Confirm at least the slugify test fails.

- [x] **Step 4: Update `writeResumeDraft` to drop the date**

Open `mainAgent/src/agent/utils/writeResumeDraft.ts`. Replace lines 28–29:

```ts
  const date = new Date().toISOString().split("T")[0];
  const filename = `${company}_${title}_${date}_v${version}.md`;
```

with:

```ts
  const filename = `${company}_${title}_v${version}.md`;
```

- [x] **Step 5: Run the test to confirm it passes**

```bash
cd mainAgent && yarn test --testPathPatterns=writeResumeDraft.test.ts
```

Expected: all `writeResumeDraft` tests PASS.

- [x] **Step 6: Lint**

```bash
cd mainAgent && yarn lint
```

Expected: no errors.

- [x] **Step 7: Commit**

```bash
git add mainAgent/src/agent/utils/writeResumeDraft.ts mainAgent/tests/utils/writeResumeDraft.test.ts
git commit -m "refactor: drop date from resume draft filename for idempotency"
```

---

### Task 2: Create the `reviewDraft` node (TDD)

**Files:**
- Create: `mainAgent/src/agent/nodes/reviewDraft.ts`
- Create: `mainAgent/tests/nodes/reviewDraft.test.ts`

- [x] **Step 1: Write the failing test file**

Create `mainAgent/tests/nodes/reviewDraft.test.ts` with this exact content:

```ts
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockWriteResumeDraft = jest.fn(
  (_draft: string, _job: unknown, version: number) => `/tmp/fake_v${version}.md`,
);
const mockInterrupt = jest.fn(() => "approve");

jest.unstable_mockModule("../../src/agent/utils/writeResumeDraft.js", () => ({
  writeResumeDraft: mockWriteResumeDraft,
}));

jest.unstable_mockModule("@langchain/langgraph", () => ({
  interrupt: mockInterrupt,
}));

const baseJobDetails = {
  title: "Senior Engineer",
  company: "Acme",
  requiredSkills: ["TypeScript"],
  preferredSkills: [],
  responsibilities: ["Build APIs"],
  experienceLevel: "senior" as const,
  keyThemes: ["reliability"],
  locationRemotePolicy: "Remote",
  industryDomain: "Fintech",
  softSkills: [],
  educationCertifications: [],
  companyValuesCulture: [],
  highPriorityKeywords: [],
  atsKeywords: [],
};

const baseState = {
  messages: [],
  rawJobInput: "",
  rawResumeInput: "",
  jobDetails: baseJobDetails,
  resumeDraft: "# Tailored Resume",
  draftVersion: 1,
  userFeedback: null,
};

describe("reviewDraft node", () => {
  beforeEach(() => {
    mockWriteResumeDraft.mockClear();
    mockInterrupt.mockClear();
  });

  it("writes the draft and returns userFeedback from interrupt", async () => {
    const { reviewDraft } = await import("../../src/agent/nodes/reviewDraft.js");
    const result = await reviewDraft(baseState, {});
    expect(mockWriteResumeDraft).toHaveBeenCalledWith(
      "# Tailored Resume",
      baseJobDetails,
      1,
    );
    expect(mockInterrupt).toHaveBeenCalledTimes(1);
    expect(result.userFeedback).toBe("approve");
  });

  it("includes the file path in the interrupt message", async () => {
    const { reviewDraft } = await import("../../src/agent/nodes/reviewDraft.js");
    await reviewDraft(baseState, {});
    const message = mockInterrupt.mock.calls[0][0] as string;
    expect(message).toContain("/tmp/fake_v1.md");
    expect(message).toContain("approve");
  });

  it("throws when resumeDraft is null", async () => {
    const { reviewDraft } = await import("../../src/agent/nodes/reviewDraft.js");
    await expect(
      reviewDraft({ ...baseState, resumeDraft: null }, {}),
    ).rejects.toThrow("resumeDraft is null");
    expect(mockWriteResumeDraft).not.toHaveBeenCalled();
    expect(mockInterrupt).not.toHaveBeenCalled();
  });

  it("throws when jobDetails is null", async () => {
    const { reviewDraft } = await import("../../src/agent/nodes/reviewDraft.js");
    await expect(
      reviewDraft({ ...baseState, jobDetails: null }, {}),
    ).rejects.toThrow("jobDetails is null");
    expect(mockWriteResumeDraft).not.toHaveBeenCalled();
    expect(mockInterrupt).not.toHaveBeenCalled();
  });

  it("is idempotent: two invocations with the same state call writeResumeDraft with identical args", async () => {
    const { reviewDraft } = await import("../../src/agent/nodes/reviewDraft.js");
    await reviewDraft(baseState, {});
    await reviewDraft(baseState, {});
    expect(mockWriteResumeDraft).toHaveBeenCalledTimes(2);
    expect(mockWriteResumeDraft.mock.calls[0]).toEqual(
      mockWriteResumeDraft.mock.calls[1],
    );
  });
});
```

- [x] **Step 2: Run the test to confirm it fails**

```bash
cd mainAgent && yarn test --testPathPatterns=reviewDraft.test.ts
```

Expected: FAIL with "Cannot find module '../../src/agent/nodes/reviewDraft.js'" or equivalent.

- [x] **Step 3: Implement the `reviewDraft` node**

Create `mainAgent/src/agent/nodes/reviewDraft.ts` with:

```ts
import { RunnableConfig } from "@langchain/core/runnables";
import { interrupt } from "@langchain/langgraph";
import { StateAnnotation } from "../state.js";
import { writeResumeDraft } from "../utils/writeResumeDraft.js";

export const reviewDraft = async (
  state: typeof StateAnnotation.State,
  _config: RunnableConfig,
): Promise<typeof StateAnnotation.Update> => {
  if (!state.resumeDraft) {
    throw new Error("reviewDraft: resumeDraft is null");
  }
  if (!state.jobDetails) {
    throw new Error("reviewDraft: jobDetails is null");
  }

  const filePath = writeResumeDraft(
    state.resumeDraft,
    state.jobDetails,
    state.draftVersion,
  );

  const userFeedback = interrupt(
    `Draft written to: ${filePath}\n\nType 'approve' to finalize, or provide feedback to revise.`,
  ) as string;

  return { userFeedback };
};
```

- [x] **Step 4: Run the test to confirm it passes**

```bash
cd mainAgent && yarn test --testPathPatterns=reviewDraft.test.ts
```

Expected: all 5 tests PASS.

- [x] **Step 5: Lint**

```bash
cd mainAgent && yarn lint
```

Expected: no errors.

- [x] **Step 6: Commit**

```bash
git add mainAgent/src/agent/nodes/reviewDraft.ts mainAgent/tests/nodes/reviewDraft.test.ts
git commit -m "feat: add shared reviewDraft node for HITL approval"
```

---

### Task 3: Strip file write + interrupt from `tailorResume`

**Files:**
- Modify: `mainAgent/src/agent/nodes/tailorResume.ts`
- Modify: `mainAgent/tests/nodes/tailorResume.test.ts`

**Note on ordering:** The existing test mocks `@langchain/langgraph` and `writeResumeDraft.js`. We **keep those mocks during the failing-test step** so the failure mode is clean (an assertion mismatch, not a real `GraphInterrupt` thrown outside a graph context). The mocks are removed in a cleanup step after the implementation change.

- [x] **Step 1: Update only the assertion — keep all existing mocks**

Open `mainAgent/tests/nodes/tailorResume.test.ts`. In the `it("extracts the resume field from structured output and stores it as resumeDraft", ...)` test, change one line:

Replace:

```ts
    expect(result.userFeedback).toBe("approve");
```

with:

```ts
    expect(result.userFeedback).toBeUndefined();
```

Leave everything else in this file unchanged for now (including the two `unstable_mockModule` blocks for `writeResumeDraft.js` and `@langchain/langgraph` and the two guard-clause tests).

- [x] **Step 2: Run the test to confirm it fails**

```bash
cd mainAgent && yarn test --testPathPatterns=tailorResume.test.ts
```

Expected: FAIL on `expect(result.userFeedback).toBeUndefined()` — current node still returns `userFeedback: "approve"` (from the mocked interrupt). Failure is clean because mocks intercept the real `interrupt` and `writeResumeDraft`.

- [x] **Step 3: Update `tailorResume.ts` to drop file write + interrupt**

Open `mainAgent/src/agent/nodes/tailorResume.ts` and replace the entire file with:

```ts
import { RunnableConfig } from "@langchain/core/runnables";
import { ChatAnthropic } from "@langchain/anthropic";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { StateAnnotation } from "../state.js";
import { TailorOutputSchema } from "../types.js";
import { tailorResumeSystemPrompt } from "../prompts/tailorResume.js";

const structuredModel = new ChatAnthropic({
  model: "claude-haiku-4-5-20251001",
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 2,
}).withStructuredOutput(TailorOutputSchema);

export const tailorResume = async (
  state: typeof StateAnnotation.State,
  _config: RunnableConfig,
): Promise<typeof StateAnnotation.Update> => {
  if (!state.rawResumeInput.trim()) {
    throw new Error("tailorResume: rawResumeInput is empty");
  }
  if (!state.jobDetails) {
    throw new Error("tailorResume: jobDetails is null");
  }

  const result = await structuredModel.invoke([
    new SystemMessage(tailorResumeSystemPrompt),
    new HumanMessage(
      `Original Resume:\n${state.rawResumeInput}\n\nJob Details:\n${JSON.stringify(state.jobDetails, null, 2)}`,
    ),
  ]);

  return { resumeDraft: result.resume, draftVersion: 1 };
};
```

(Changes: removed `interrupt`, `writeResumeDraft`, file-write call, and `userFeedback` from the return value.)

- [x] **Step 4: Run the test to confirm it passes**

```bash
cd mainAgent && yarn test --testPathPatterns=tailorResume.test.ts
```

Expected: all `tailorResume` tests PASS.

- [x] **Step 5: Remove now-unused mocks from the test**

Open `mainAgent/tests/nodes/tailorResume.test.ts`. Delete these two blocks (the node no longer imports either module):

```ts
// Mock writeResumeDraft to avoid filesystem writes
jest.unstable_mockModule("../../src/agent/utils/writeResumeDraft.js", () => ({
  writeResumeDraft: jest.fn(() => "/tmp/fake_draft_v1.md"),
}));

// Mock @langchain/langgraph's interrupt to return a fixed feedback value
jest.unstable_mockModule("@langchain/langgraph", () => ({
  interrupt: jest.fn(() => "approve"),
}));
```

- [x] **Step 6: Run the test again to confirm it still passes**

```bash
cd mainAgent && yarn test --testPathPatterns=tailorResume.test.ts
```

Expected: all `tailorResume` tests still PASS — the deleted mocks were no longer used.

- [x] **Step 7: Lint**

```bash
cd mainAgent && yarn lint
```

Expected: no errors.

- [x] **Step 8: Commit**

```bash
git add mainAgent/src/agent/nodes/tailorResume.ts mainAgent/tests/nodes/tailorResume.test.ts
git commit -m "refactor: strip file write and interrupt from tailorResume"
```

---

### Task 4: Strip file write + interrupt from `reviseResume`

**Files:**
- Modify: `mainAgent/src/agent/nodes/reviseResume.ts`
- Create: `mainAgent/tests/nodes/reviseResume.test.ts`

**Note on ordering:** The current `reviseResume.ts` still imports `writeResumeDraft` and `interrupt`. To get a clean failing test against the OLD impl, we mock both and assert they're never called. After the impl change, both assertions hold. We keep them in the test as guardrails (if anyone re-introduces a side effect inside this node, the test catches it).

- [ ] **Step 1: Write the failing test file**

Create `mainAgent/tests/nodes/reviseResume.test.ts` with:

```ts
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockInvoke = jest.fn(async () => ({ content: "# Revised Resume" }));
const mockWriteResumeDraft = jest.fn(() => "/tmp/should_not_be_called.md");
const mockInterrupt = jest.fn(() => "approve");

jest.unstable_mockModule("@langchain/anthropic", () => ({
  ChatAnthropic: jest.fn().mockImplementation(() => ({
    invoke: mockInvoke,
  })),
}));

jest.unstable_mockModule("../../src/agent/utils/writeResumeDraft.js", () => ({
  writeResumeDraft: mockWriteResumeDraft,
}));

jest.unstable_mockModule("@langchain/langgraph", () => ({
  interrupt: mockInterrupt,
}));

const baseJobDetails = {
  title: "Senior Engineer",
  company: "Acme",
  requiredSkills: ["TypeScript"],
  preferredSkills: [],
  responsibilities: ["Build APIs"],
  experienceLevel: "senior" as const,
  keyThemes: ["reliability"],
  locationRemotePolicy: "Remote",
  industryDomain: "Fintech",
  softSkills: [],
  educationCertifications: [],
  companyValuesCulture: [],
  highPriorityKeywords: [],
  atsKeywords: [],
};

const baseState = {
  messages: [],
  rawJobInput: "",
  rawResumeInput: "",
  jobDetails: baseJobDetails,
  resumeDraft: "# Old Resume",
  draftVersion: 1,
  userFeedback: "Make summary shorter",
};

describe("reviseResume node", () => {
  beforeEach(() => {
    mockInvoke.mockClear();
    mockWriteResumeDraft.mockClear();
    mockInterrupt.mockClear();
  });

  it("returns the revised draft, increments draftVersion, and does not write a file or interrupt", async () => {
    const { reviseResume } = await import("../../src/agent/nodes/reviseResume.js");
    const result = await reviseResume(baseState, {});
    expect(result.resumeDraft).toBe("# Revised Resume");
    expect(result.draftVersion).toBe(2);
    expect(result.userFeedback).toBeUndefined();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockWriteResumeDraft).not.toHaveBeenCalled();
    expect(mockInterrupt).not.toHaveBeenCalled();
  });

  it("throws when resumeDraft is null", async () => {
    const { reviseResume } = await import("../../src/agent/nodes/reviseResume.js");
    await expect(
      reviseResume({ ...baseState, resumeDraft: null }, {}),
    ).rejects.toThrow("resumeDraft is null");
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("throws when userFeedback is null", async () => {
    const { reviseResume } = await import("../../src/agent/nodes/reviseResume.js");
    await expect(
      reviseResume({ ...baseState, userFeedback: null }, {}),
    ).rejects.toThrow("userFeedback is null");
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("throws when jobDetails is null", async () => {
    const { reviseResume } = await import("../../src/agent/nodes/reviseResume.js");
    await expect(
      reviseResume({ ...baseState, jobDetails: null }, {}),
    ).rejects.toThrow("jobDetails is null");
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd mainAgent && yarn test --testPathPatterns=reviseResume.test.ts
```

Expected: FAIL — at minimum on `expect(mockWriteResumeDraft).not.toHaveBeenCalled()` and `expect(mockInterrupt).not.toHaveBeenCalled()` (current node calls both), and on `expect(result.userFeedback).toBeUndefined()` (current node returns `userFeedback`). All failures are clean assertion mismatches because the mocks intercept the real side effects.

- [ ] **Step 3: Update `reviseResume.ts` to drop file write + interrupt**

Open `mainAgent/src/agent/nodes/reviseResume.ts` and replace the entire file with:

```ts
import { RunnableConfig } from "@langchain/core/runnables";
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage } from "@langchain/core/messages";
import { StateAnnotation } from "../state.js";

const model = new ChatAnthropic({
  model: "claude-haiku-4-5-20251001",
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 2,
});

export const reviseResume = async (
  state: typeof StateAnnotation.State,
  _config: RunnableConfig,
): Promise<typeof StateAnnotation.Update> => {
  if (!state.resumeDraft) {
    throw new Error("reviseResume: resumeDraft is null");
  }
  if (!state.userFeedback) {
    throw new Error("reviseResume: userFeedback is null");
  }
  if (!state.jobDetails) {
    throw new Error("reviseResume: jobDetails is null");
  }

  const result = await model.invoke([
    new HumanMessage(
      `Here is the current resume draft:\n\n${state.resumeDraft}\n\nPlease make the following changes only — preserve everything else:\n${state.userFeedback}`,
    ),
  ]);

  const newDraft = typeof result.content === "string"
    ? result.content
    : JSON.stringify(result.content);

  return { resumeDraft: newDraft, draftVersion: state.draftVersion + 1 };
};
```

(Changes: removed `interrupt`, `writeResumeDraft`, file-write call, and `userFeedback` from the return value.)

- [ ] **Step 4: Run the test to confirm it passes**

```bash
cd mainAgent && yarn test --testPathPatterns=reviseResume.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Lint**

```bash
cd mainAgent && yarn lint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add mainAgent/src/agent/nodes/reviseResume.ts mainAgent/tests/nodes/reviseResume.test.ts
git commit -m "refactor: strip file write and interrupt from reviseResume"
```

---

### Task 5: Wire `reviewDraft` into the graph

**Files:**
- Modify: `mainAgent/src/agent/graph.ts`
- Modify: `mainAgent/tests/nodes/routing.test.ts`

- [ ] **Step 1: Update routing test to mock the new node**

Open `mainAgent/tests/nodes/routing.test.ts`. After the existing `jest.unstable_mockModule("../../src/agent/nodes/reviseResume.js", ...)` block (around line 13-15), insert:

```ts
jest.unstable_mockModule("../../src/agent/nodes/reviewDraft.js", () => ({
  reviewDraft: jest.fn(),
}));
```

This is required because `graph.ts` will now import `reviewDraft.js`, and the test mocks all node imports to keep the routing test isolated. The routing test's behavior under `afterReview` does not change — `afterReview` reads the same `userFeedback` field — so no other edits to this file.

- [ ] **Step 2: Run the routing test to confirm it still passes**

```bash
cd mainAgent && yarn test --testPathPatterns=routing.test.ts
```

Expected: PASS (the mock is added pre-emptively; with the current `graph.ts`, this is a no-op extra mock, so tests still pass).

- [ ] **Step 3: Update `graph.ts` to register `reviewDraft` and reroute edges**

Open `mainAgent/src/agent/graph.ts` and replace the entire file with:

```ts
import { StateGraph } from "@langchain/langgraph";
import { StateAnnotation } from "./state.js";
import { parseJobInput } from "./nodes/parseJobInput.js";
import { extractJobDetails } from "./nodes/extractJobDetails.js";
import { tailorResume } from "./nodes/tailorResume.js";
import { reviseResume } from "./nodes/reviseResume.js";
import { reviewDraft } from "./nodes/reviewDraft.js";

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
  .addNode("reviewDraft", reviewDraft)
  .addEdge("__start__", "parseJobInput")
  .addEdge("parseJobInput", "extractJobDetails")
  .addEdge("extractJobDetails", "tailorResume")
  .addEdge("tailorResume", "reviewDraft")
  .addEdge("reviseResume", "reviewDraft")
  .addConditionalEdges("reviewDraft", afterReview);

export const graph = builder.compile();
graph.name = "MainAgent";
```

(Changes: added `reviewDraft` import + `addNode`; replaced both `addConditionalEdges("tailorResume", ...)` and `addConditionalEdges("reviseResume", ...)` with unconditional `addEdge` calls into `reviewDraft`; attached the single conditional edge to `reviewDraft`.)

- [ ] **Step 4: Run the full test suite**

```bash
cd mainAgent && yarn test
```

Expected: ALL tests PASS — `writeResumeDraft`, `reviewDraft`, `tailorResume`, `reviseResume`, `routing`, `parseJobInput`, `extractJobDetails`.

- [ ] **Step 5: Lint and format-check**

```bash
cd mainAgent && yarn lint && yarn format:check
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add mainAgent/src/agent/graph.ts mainAgent/tests/nodes/routing.test.ts
git commit -m "feat: route tailor and revise through shared reviewDraft node"
```

---

### Task 6: End-to-end smoke verification

**Files:** none (verification only).

- [ ] **Step 1: Build the project**

```bash
cd mainAgent && yarn build
```

Expected: clean TypeScript build, no errors.

- [ ] **Step 2: Re-run full test + lint suite**

```bash
cd mainAgent && yarn test && yarn lint && yarn format:check
```

Expected: all green.

- [ ] **Step 3: Confirm git log shows the expected sequence**

```bash
git log --oneline -7
```

Expected (top to bottom):
1. `feat: route tailor and revise through shared reviewDraft node`
2. `refactor: strip file write and interrupt from reviseResume`
3. `refactor: strip file write and interrupt from tailorResume`
4. `feat: add shared reviewDraft node for HITL approval`
5. `refactor: drop date from resume draft filename for idempotency`
6. `docs: add langgraph interrupt redesign spec`
7. (prior commit)

- [ ] **Step 4: Manual sanity check of the topology**

Open `mainAgent/src/agent/graph.ts` and confirm:
- `addNode("reviewDraft", reviewDraft)` is present.
- `addEdge("tailorResume", "reviewDraft")` and `addEdge("reviseResume", "reviewDraft")` are present.
- `addConditionalEdges("reviewDraft", afterReview)` is the only conditional edge.
- No `addConditionalEdges` calls on `tailorResume` or `reviseResume`.

If all four conditions hold, the redesign is complete.

---

## Acceptance Criteria

- All Jest tests pass (`yarn test`).
- Lint and format checks pass.
- The LLM call inside `tailorResume` and `reviseResume` is **not** preceded by an `interrupt()` call anywhere in the same node.
- `reviewDraft` is the sole node containing `interrupt()`.
- `writeResumeDraft` produces deterministic filenames given identical `(jobDetails, version)`.
- Filename format matches `{slugified_company}_{slugified_title}_v{N}.md` exactly (no date).
