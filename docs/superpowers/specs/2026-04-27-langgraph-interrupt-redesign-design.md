# LangGraph Interrupt Redesign — Split Generators from Shared Review Node

**Date:** 2026-04-27
**Status:** Approved
**Scope:** `mainAgent/src/agent/`

## Problem

`tailorResume` and `reviseResume` each call an LLM, write a draft file, and then call `interrupt()` for human approval — all in one node body.

LangGraph's documented behavior: when execution resumes after `interrupt()`, the runtime restarts the entire node from the beginning. Any code that ran before the interrupt runs again. In our case, that means **the LLM call fires twice** every time the user provides feedback or approves: once on first execution, once on resume. This burns tokens and produces a different (potentially divergent) draft on the replay than the one the user reviewed.

The same issue applies to `writeResumeDraft`, though file writes are cheaper.

## Goal

Eliminate duplicate LLM execution on interrupt resume by restructuring the graph so the interrupt lives in a node whose replay is provably a no-op. Remove duplication between the two interrupt sites at the same time.

## Non-Goals

- No changes to `parseJobInput` or `extractJobDetails`.
- No new state fields beyond what already exists.
- No memoization, caching, or idempotency-key scaffolding.
- No `Command`-pattern migration — keep conditional edges, consistent with the rest of the graph.
- No checkpoint backend changes.

## Approach

Apply the LangGraph-recommended **split-node pattern**: separate expensive/non-idempotent work from the `interrupt()` call, and route both generator nodes through a single shared review node.

### Why this works

LangGraph guarantees that **previous nodes do not re-execute on resume** — only the node containing the interrupt does. So if the LLM call lives in an upstream node and the interrupt lives in a downstream node whose replay is a no-op, the LLM call fires exactly once.

### Why a shared review node (vs. one review node per generator)

The interrupt logic, file write, and approval message are identical for both `tailorResume` and `reviseResume`. A single shared `reviewDraft` node removes that duplication and gives us one source of truth for the approval loop.

## Design

### Graph topology

**Before**

```
__start__ → parseJobInput → extractJobDetails → tailorResume ─┐
                                                              ├→ afterReview → __end__
                                              reviseResume ───┘                    │
                                                       ▲                           │
                                                       └───────────────────────────┘
```

**After**

```
__start__ → parseJobInput → extractJobDetails → tailorResume ──┐
                                                               ├→ reviewDraft → afterReview → __end__
                                              reviseResume ────┘                    │
                                                     ▲                              │
                                                     └──────────────────────────────┘
```

- Both generator nodes have an unconditional edge to `reviewDraft`.
- `afterReview` (the conditional edge function) attaches to `reviewDraft` only.
- `afterReview` semantics unchanged: `userFeedback === "approve"` → `__end__`, else → `reviseResume`.

### Node responsibilities & state contracts

| Node           | Reads                                                    | Returns                                            | Side effects             |
| -------------- | -------------------------------------------------------- | -------------------------------------------------- | ------------------------ |
| `tailorResume` | `rawResumeInput`, `jobDetails`                           | `{ resumeDraft, draftVersion: 1 }`                 | LLM call                 |
| `reviseResume` | `resumeDraft`, `userFeedback`, `jobDetails`, `draftVersion` | `{ resumeDraft, draftVersion: prev + 1 }`        | LLM call                 |
| `reviewDraft`  | `resumeDraft`, `draftVersion`, `jobDetails`              | `{ userFeedback }`                                 | File write, `interrupt()` |

Generators no longer touch `userFeedback`. Review owns it exclusively.

### Idempotency analysis of `reviewDraft`

The replay must be a no-op. Per-step:

1. **State reads** — Restored from checkpoint; identical on every replay.
2. **`writeResumeDraft(...)`** — Must be a pure function of `(jobDetails, draftVersion)`. **The current implementation is not** — it embeds `new Date().toISOString().split("T")[0]` in the filename. Crossing a UTC day boundary between first execution and resume produces a different filename, orphaning the original file. **Fix:** drop the date segment from the filename. Version is already unique per draft.
3. **`interrupt(...)`** — Replay-safe by LangGraph contract: first call throws `GraphInterrupt`, second call returns the resume value.
4. **Return** — Derived solely from the resume value.

Constraints we must respect (from LangGraph docs):

- No `try/catch` around `interrupt()` (would swallow `GraphInterrupt`).
- Only one `interrupt()` call in the node, no conditionals around it (interrupt order is index-matched on resume).
- The value passed to `interrupt()` is a string — serializable.

### `reviewDraft` reference implementation

```ts
import { interrupt } from "@langchain/langgraph";
import { RunnableConfig } from "@langchain/core/runnables";
import { StateAnnotation } from "../state.js";
import { writeResumeDraft } from "../utils/writeResumeDraft.js";

export const reviewDraft = async (
  state: typeof StateAnnotation.State,
  _config: RunnableConfig,
): Promise<typeof StateAnnotation.Update> => {
  if (!state.resumeDraft) throw new Error("reviewDraft: resumeDraft is null");
  if (!state.jobDetails)  throw new Error("reviewDraft: jobDetails is null");

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

## File-Level Changes

1. **`mainAgent/src/agent/state.ts`** — No changes. Existing fields cover the contract.
2. **`mainAgent/src/agent/nodes/tailorResume.ts`** — Remove `writeResumeDraft` call, remove `interrupt`, return `{ resumeDraft, draftVersion: 1 }`. Drop unused imports.
3. **`mainAgent/src/agent/nodes/reviseResume.ts`** — Remove `writeResumeDraft` call, remove `interrupt`, return `{ resumeDraft, draftVersion: state.draftVersion + 1 }`. Drop unused imports.
4. **`mainAgent/src/agent/nodes/reviewDraft.ts`** — New file. See reference implementation above.
5. **`mainAgent/src/agent/utils/writeResumeDraft.ts`** — Drop the `date` segment from `filename`. New format: `${company}_${title}_v${version}.md`.
6. **`mainAgent/src/agent/graph.ts`** — Register `reviewDraft`. Replace conditional edges on `tailorResume`/`reviseResume` with unconditional edges to `reviewDraft`. Attach `afterReview` to `reviewDraft`.
7. **Tests** — Update existing tests for `tailorResume`/`reviseResume` to no longer assert on file write or interrupt. Add tests for `reviewDraft` covering: writes file, interrupts with path message, returns `userFeedback`. Add an idempotency test: invoking `reviewDraft` twice with identical state produces the same file path and same file contents.

## Testing Strategy

- **Generator nodes** — Existing tests already cover guard clauses and the LLM invocation path. Update assertions: no file written, no interrupt thrown. The `userFeedback` field is no longer in the return.
- **`reviewDraft`** — New tests:
  - Throws when `resumeDraft` is null.
  - Throws when `jobDetails` is null.
  - Calls `writeResumeDraft` with `(state.resumeDraft, state.jobDetails, state.draftVersion)`.
  - Calls `interrupt` with a message containing the returned file path.
  - Returns `{ userFeedback }` populated from the interrupt resume value.
  - **Idempotency:** Two sequential invocations with the same state produce the same file path and identical file contents.
- **Graph wiring** — A test that confirms `tailorResume` → `reviewDraft` and `reviseResume` → `reviewDraft`, and that `afterReview` is attached only to `reviewDraft`.

## Risks & Mitigations

- **Filename collision after dropping the date.** Unlikely in practice (one job processed per graph run, version increments monotonically), but two runs for the same `(company, title)` would overwrite. Acceptable — same behavior already exists within a single day. If this becomes a problem, revisit by adding a thread-id segment, not by re-introducing the wall-clock date.
- **Pre-existing tests assert on the old date-bearing filename.** Update them to match the new format.
- **A consumer somewhere relies on the date in the filename.** Search before changing — no callers outside the agent are expected.

## Out of Scope (for follow-up if needed)

- Migrating to the `Command` pattern to combine routing + state update inside `reviewDraft`.
- Persisting drafts to a more durable store than the local filesystem.
- Surfacing the LLM-produced `thinking` field (from `TailorOutputSchema`) anywhere.

## References

- [LangChain — Interrupts (official docs)](https://docs.langchain.com/oss/python/langgraph/interrupts)
- [LangGraph's HITL Has a Double Execution Problem](https://blog.raed.dev/posts/langgraph-hitl)
- [Making it easier to build human-in-the-loop agents with interrupt](https://blog.langchain.com/making-it-easier-to-build-human-in-the-loop-agents-with-interrupt/)
