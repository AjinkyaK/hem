# Prompt Migration — Execution Status

**Branch:** `feat/prompt-migration` (9 commits ahead of `master`)
**Plan:** `docs/superpowers/plans/2026-04-24-prompt-migration.md`
**Spec:** `docs/superpowers/specs/2026-04-24-prompt-migration-design.md`
**Last updated:** 2026-04-25

---

## Task progress

| Task | Status | Commit(s) |
|------|--------|-----------|
| 1. Expand `JobDetailsSchema` with 7 new fields | DONE | `701fa25` |
| (infra) Fix `yarn test` for Jest 30 | DONE | `8e0641f` |
| 2. Add `TailorOutputSchema` | DONE | `226d9b6` |
| 3. Migrate extraction system prompt | DONE | `be7d50e` |
| 4. Migrate tailoring system prompt | DONE | `e3683c2`, `2663bd7` |
| 5. Update `tailorResume` node to structured output | DONE | `4ccfe78`, `050cc9d`, `0bded4d` |
| 6. Manual end-to-end smoke test | PENDING — human-driven | — |
| 7. Final verification | PENDING (after Task 6) | — |

---

## Test status

- **28 unit tests pass** across `extractJobDetails.test.ts` (12), `tailorResume.test.ts` (9), `writeResumeDraft.test.ts` (7).
- **2 pre-existing test suites fail at the suite level**: `parseJobInput.test.ts` and `routing.test.ts`. Cause: jsdom transitive dependency `@csstools/css-calc/dist/index.mjs` is ESM-only and Jest cannot load it. These failures predate this branch — confirmed by running `yarn test` at the master tip before any of our work. Not caused by the migration.
- **Lint clean** (`yarn lint` exits 0).

---

## Deviations from plan (intentional)

1. **`yarn test` script fix.** Jest 30 deprecated `--testPathPattern` (singular) in favor of `--testPathPatterns` (plural). Fixed in `package.json` so the plan's verification steps work. Committed as `8e0641f`.
2. **Tailoring prompt — extra sentence in Output format.** Code review flagged that the closing rule said "output ONLY the markdown resume" without restating that `thinking` is also required. Added: "Both `thinking` and `resume` fields are required. Populate `thinking` with your full Phase 1 reasoning before writing the resume." Committed as `2663bd7`.
3. **Tailoring node tests use `jest.unstable_mockModule()`.** The plan's Step 1 used `jest.mock()` for the new node tests. That doesn't work in this codebase because the runtime is native ESM (`node --experimental-vm-modules` + `ts-jest/presets/default-esm`), and `@langchain/anthropic` is an ESM package. `jest.mock()` cannot intercept ESM modules whose live bindings resolve at parse time. Switched to `jest.unstable_mockModule()` + dynamic `await import()`, which is the documented Jest+ESM pattern. The node code itself still uses module-top-level `structuredModel` (matching `extractJobDetails.ts`).
4. **Guard-clause tests assert `mockInvoke` not called.** Code review suggestion. Adds two `expect(mockInvoke).not.toHaveBeenCalled()` lines to the "throws when rawResumeInput is empty" and "throws when jobDetails is null" tests. Committed as `0bded4d`.

---

## Open observations from code review (not yet addressed)

These were flagged during reviews but not blocking. Worth observing during the smoke test or revisiting later:

1. **Extraction prompt — `highPriorityKeywords` heuristic on plain text.** The instruction says "Terms or phrases that appear 2+ times in the posting, OR are emphasized through bold/caps/headings, OR appear in multiple sections." For plain-text job postings (no formatting metadata), the second and third criteria are unverifiable. The model may either skip them or hallucinate formatting signals. **Action item if needed:** Append "If the posting is plain text with no visible formatting, rely only on repetition frequency."

2. **Extraction prompt — `responsibilities` count constraint.** Says "3-7 key responsibilities" but some JDs only list 2 distinct duties. The schema (`z.array(z.string())`) does not enforce a minimum, but the prompt implies 3 is a floor. Risk: model pads to hit minimum.

3. **Extraction prompt — overlapping example.** Both `softSkills` and `keyThemes` use "cross-functional collaboration" as an example. May cause the model to put the same value in both fields. Suggested swap for `keyThemes`: "platform reliability" or "infrastructure modernization."

4. **Tailoring prompt — 1-page hardcoded.** Style preferences say "1 page. Hard limit." Staff-level resumes often need 2 pages. This is intentional per spec (baked personal preference) but worth observing if outputs feel compressed for Staff-level applications.

5. **Tailoring prompt — duplicated bullet guidance.** "3-4 bullets per role is a starting point" appears in both Phase 1 step 1.3 (bullet decisions) and Phase 2 Experience section. Not contradictory, but the model may over-weight bullet restoration.

---

## How to resume in the next session

### To run the smoke test (Task 6)

1. Confirm `mainAgent/.env` has a valid `ANTHROPIC_API_KEY`.
2. Start the LangGraph dev server / runner — check `mainAgent/langgraph.json` and `mainAgent/README.md` for the invocation. (Typical: `cd mainAgent && yarn build && langgraph dev`.)
3. Invoke the graph with:
   - `rawJobInput`: a real job posting URL or pasted text
   - `rawResumeInput`: your current resume text (the `Resume_Template.docx` markdown content)
4. Observe:
   - **Extraction trace:** Does the resulting `jobDetails` populate all 14 fields, including the 7 new ones (`locationRemotePolicy`, `industryDomain`, `softSkills`, `educationCertifications`, `companyValuesCulture`, `highPriorityKeywords`, `atsKeywords`)?
   - **Tailored output:** Is a markdown draft written to a file? (Path is printed in the interrupt prompt.)
   - **Style alignment:** Does the draft mirror JD keywords, follow your style preferences, and avoid banned words?
   - **Thinking field:** If LangSmith is enabled, is the Phase 1 reasoning visible in the trace for the `tailorResume` node?
5. Report any issues — describe input, expected output, actual output.

### To finalize (Task 7)

Once smoke test passes:

1. Run `yarn test` and confirm 28 tests pass (the 2 pre-existing jsdom failures will still show — that's OK).
2. Run `yarn lint:all` (or `yarn lint` + `yarn lint:langgraph-json` + `yarn format:check`).
3. Decide merge strategy: `git rebase` onto `master` then merge, or open PR for review.
4. Use `superpowers:finishing-a-development-branch` skill if you want guided completion.

### If smoke test surfaces prompt issues

For each observed issue:
1. Identify which prompt file is the source (`src/agent/prompts/extractJobDetails.ts` or `src/agent/prompts/tailorResume.ts`).
2. Make a targeted edit.
3. Commit each prompt patch individually so iteration history is clean.
4. Re-run the smoke test.

---

## Files changed on this branch

- `mainAgent/package.json` — Jest 30 script fix
- `mainAgent/src/agent/types.ts` — expanded `JobDetailsSchema`, added `TailorOutputSchema`
- `mainAgent/src/agent/prompts/extractJobDetails.ts` — full prompt rewrite
- `mainAgent/src/agent/prompts/tailorResume.ts` — full prompt rewrite with baked career context + style preferences
- `mainAgent/src/agent/nodes/tailorResume.ts` — switched to `withStructuredOutput`
- `mainAgent/tests/nodes/extractJobDetails.test.ts` — expanded test coverage for new schema fields
- `mainAgent/tests/nodes/tailorResume.test.ts` — new file: schema tests + node integration tests
- `mainAgent/tests/utils/writeResumeDraft.test.ts` — fixture updated for expanded schema
- `docs/superpowers/specs/2026-04-24-prompt-migration-design.md` — design spec
- `docs/superpowers/plans/2026-04-24-prompt-migration.md` — implementation plan
