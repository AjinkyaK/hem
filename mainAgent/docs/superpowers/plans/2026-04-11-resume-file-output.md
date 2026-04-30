# Resume File Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write each resume draft to a versioned markdown file on disk and surface the file path via `interrupt()` instead of dumping the full resume text into the LangGraph Studio UI.

**Architecture:** A shared `writeResumeDraft` helper handles slugification, directory creation, and file writing; it accepts an optional `outputDir` parameter so it can be tested without mocking `fs`. Both `tailorResume` and `reviseResume` call this helper and pass the returned path to `interrupt()`. A new `draftVersion` field in state tracks the current revision number across the human-in-the-loop cycle.

**Tech Stack:** Node.js `fs`, `path`, `os` (stdlib); TypeScript; Jest (ts-jest ESM preset)

---

### Task 1: Add `draftVersion` to state

**Files:**

- Modify: `src/agent/state.ts`

- [ ] **Step 1: Add the field**

In `src/agent/state.ts`, add `draftVersion` after `resumeDraft`:

```ts
draftVersion: Annotation<number>({
  default: () => 0,
  reducer: (_, b) => b,
}),
```

Full file after change:

```ts
// src/agent/state.ts
import { BaseMessage, BaseMessageLike } from "@langchain/core/messages";
import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import { JobDetails } from "./types.js";

export const StateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[], BaseMessageLike[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  rawJobInput: Annotation<string>({
    default: () => "",
    reducer: (_, b) => b,
  }),
  rawResumeInput: Annotation<string>({
    default: () => "",
    reducer: (_, b) => b,
  }),
  jobDetails: Annotation<JobDetails | null>({
    default: () => null,
    reducer: (_, b) => b,
  }),
  resumeDraft: Annotation<string | null>({
    default: () => null,
    reducer: (_, b) => b,
  }),
  draftVersion: Annotation<number>({
    default: () => 0,
    reducer: (_, b) => b,
  }),
  userFeedback: Annotation<string | null>({
    default: () => null,
    reducer: (_, b) => b,
  }),
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd mainAgent && yarn build
```

Expected: exits 0, no type errors.

- [ ] **Step 3: Commit**

```bash
git add mainAgent/src/agent/state.ts
git commit -m "feat: add draftVersion field to state"
```

---

### Task 2: Implement `writeResumeDraft` helper (TDD)

**Files:**

- Create: `src/agent/utils/writeResumeDraft.ts`
- Create: `tests/utils/writeResumeDraft.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/utils/writeResumeDraft.test.ts`:

```ts
import { describe, it, expect, afterEach } from "@jest/globals";
import fs from "fs";
import path from "path";
import os from "os";
import { writeResumeDraft } from "../../src/agent/utils/writeResumeDraft.js";
import { JobDetails } from "../../src/agent/types.js";

const tmpDir = path.join(os.tmpdir(), "writeResumeDraft_test");

const jobDetails: JobDetails = {
  title: "Senior Software Engineer",
  company: "Stripe, Inc.",
  requiredSkills: ["TypeScript", "Node.js"],
  preferredSkills: ["Kubernetes"],
  responsibilities: ["Build APIs"],
  experienceLevel: "senior",
  keyThemes: ["reliability"],
};

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("writeResumeDraft", () => {
  it("creates the output directory if it does not exist", () => {
    writeResumeDraft("# Resume", jobDetails, 1, tmpDir);
    expect(fs.existsSync(tmpDir)).toBe(true);
  });

  it("writes the draft content to a .md file", () => {
    const filePath = writeResumeDraft("# My Resume", jobDetails, 1, tmpDir);
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toBe("# My Resume");
  });

  it("returns the absolute file path", () => {
    const filePath = writeResumeDraft("# Resume", jobDetails, 1, tmpDir);
    expect(path.isAbsolute(filePath)).toBe(true);
    expect(filePath.endsWith(".md")).toBe(true);
  });

  it("slugifies company and title into the filename", () => {
    const filePath = writeResumeDraft("# Resume", jobDetails, 1, tmpDir);
    const filename = path.basename(filePath);
    expect(filename).toMatch(/^stripe_inc_senior_software_engineer_/);
  });

  it("includes the version number in the filename", () => {
    const filePath = writeResumeDraft("# Resume", jobDetails, 3, tmpDir);
    const filename = path.basename(filePath);
    expect(filename).toMatch(/_v3\.md$/);
  });

  it("includes today's date in the filename", () => {
    const today = new Date().toISOString().split("T")[0];
    const filePath = writeResumeDraft("# Resume", jobDetails, 1, tmpDir);
    const filename = path.basename(filePath);
    expect(filename).toContain(today);
  });

  it("writes distinct files for different versions", () => {
    const path1 = writeResumeDraft("v1", jobDetails, 1, tmpDir);
    const path2 = writeResumeDraft("v2", jobDetails, 2, tmpDir);
    expect(path1).not.toBe(path2);
    expect(fs.readFileSync(path1, "utf-8")).toBe("v1");
    expect(fs.readFileSync(path2, "utf-8")).toBe("v2");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd mainAgent && yarn test tests/utils/writeResumeDraft.test.ts
```

Expected: FAIL — `Cannot find module '../../src/agent/utils/writeResumeDraft.js'`

- [ ] **Step 3: Implement the helper**

Create `src/agent/utils/writeResumeDraft.ts`:

```ts
import fs from "fs";
import path from "path";
import os from "os";
import { JobDetails } from "../types.js";

const DEFAULT_OUTPUT_DIR = path.join(
  os.homedir(),
  "ajinkyakale",
  "TailoredResumes",
);

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

export function writeResumeDraft(
  draft: string,
  jobDetails: JobDetails,
  version: number,
  outputDir: string = DEFAULT_OUTPUT_DIR,
): string {
  const company = slugify(jobDetails.company);
  const title = slugify(jobDetails.title);
  const date = new Date().toISOString().split("T")[0];
  const filename = `${company}_${title}_${date}_v${version}.md`;
  const filePath = path.join(outputDir, filename);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(filePath, draft, "utf-8");

  return filePath;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd mainAgent && yarn test tests/utils/writeResumeDraft.test.ts
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd mainAgent && yarn build
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add mainAgent/src/agent/utils/writeResumeDraft.ts mainAgent/tests/utils/writeResumeDraft.test.ts
git commit -m "feat: add writeResumeDraft helper with tests"
```

---

### Task 3: Update `tailorResume` node

**Files:**

- Modify: `src/agent/nodes/tailorResume.ts`

- [ ] **Step 1: Update the node**

Replace the full contents of `src/agent/nodes/tailorResume.ts`:

```ts
import { RunnableConfig } from "@langchain/core/runnables";
import { ChatAnthropic } from "@langchain/anthropic";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { interrupt } from "@langchain/langgraph";
import { StateAnnotation } from "../state.js";
import { tailorResumeSystemPrompt } from "../prompts/tailorResume.js";
import { writeResumeDraft } from "../utils/writeResumeDraft.js";

const model = new ChatAnthropic({
  model: "claude-3-5-haiku-20241022",
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 2,
});

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

  const result = await model.invoke([
    new SystemMessage(tailorResumeSystemPrompt),
    new HumanMessage(
      `Original Resume:\n${state.rawResumeInput}\n\nJob Details:\n${JSON.stringify(state.jobDetails, null, 2)}`,
    ),
  ]);

  const draft =
    typeof result.content === "string"
      ? result.content
      : JSON.stringify(result.content);

  const filePath = writeResumeDraft(draft, state.jobDetails, 1);

  const userFeedback = interrupt(
    `Draft written to: ${filePath}\n\nType 'approve' to finalize, or provide feedback to revise.`,
  ) as string;

  return { resumeDraft: draft, draftVersion: 1, userFeedback };
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd mainAgent && yarn build
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add mainAgent/src/agent/nodes/tailorResume.ts
git commit -m "feat: write resume draft to file in tailorResume node"
```

---

### Task 4: Update `reviseResume` node

**Files:**

- Modify: `src/agent/nodes/reviseResume.ts`

- [ ] **Step 1: Update the node**

Replace the full contents of `src/agent/nodes/reviseResume.ts`:

```ts
import { RunnableConfig } from "@langchain/core/runnables";
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage } from "@langchain/core/messages";
import { interrupt } from "@langchain/langgraph";
import { StateAnnotation } from "../state.js";
import { writeResumeDraft } from "../utils/writeResumeDraft.js";

const model = new ChatAnthropic({
  model: "claude-3-5-haiku-20241022",
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

  const newDraft =
    typeof result.content === "string"
      ? result.content
      : JSON.stringify(result.content);

  const newVersion = state.draftVersion + 1;
  const filePath = writeResumeDraft(newDraft, state.jobDetails, newVersion);

  const userFeedback = interrupt(
    `Draft written to: ${filePath}\n\nType 'approve' to finalize, or provide feedback to revise.`,
  ) as string;

  return { resumeDraft: newDraft, draftVersion: newVersion, userFeedback };
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd mainAgent && yarn build
```

Expected: exits 0.

- [ ] **Step 3: Run the full test suite**

```bash
cd mainAgent && yarn test
```

Expected: all tests PASS.

- [ ] **Step 4: Run the linter**

```bash
cd mainAgent && yarn lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add mainAgent/src/agent/nodes/reviseResume.ts
git commit -m "feat: write resume draft to file in reviseResume node"
```
