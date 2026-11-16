# Hem feature status: agreed, implemented, tested

> **Historical snapshot, not a live document.** This is a one-time audit of the human-in-the-loop Hem at `dfa69b8` (2026-11-15), taken before the switch to autonomous Hem on map #27. It is kept on an unmerged `research/` branch for reference only and will not be updated. Its findings now live in #26, #23, #24 and map #27.

Research into what Hem supports today. Gathered 2026-11-15 at `main` = `dfa69b8`.

Sources are primary only: the code under `src/hem/`, the tests under `tests/`, `README.md`, `GLOSSARY.md`, `docs/adr/`, `CODING_STANDARDS.md`, the legacy `.scratch/node-tests/` spec, GitHub Issues and PRs on `AjinkyaK/hem`, and commands run locally. Line numbers refer to `dfa69b8`.

## Answer in brief

- **Hem does one thing:** a LangGraph pipeline that goes from Job Posting to Job Details to a Resume Draft at Revision 1, then loops through Human Review and Revision Feedback until the Applicant types `approve`. Every node in that pipeline exists in code (`src/hem/graph.py:21-44`).
- **Agreed scope for the product lives only in docs, not issues.** All 21 GitHub issues and 4 PRs cover tooling: checks, CI, the ruleset and coding standards. None of them specifies product behaviour. The product scope comes from the README Architecture section, `GLOSSARY.md`, three ADRs, and a TypeScript-era spec in `.scratch/node-tests/`.
- **Headline counts (product):** 10 agreed behaviours. All 10 are implemented, plus 2 that no doc specifies (the `hem` CLI and the LangGraph Studio config). 6 have direct unit tests and 1 more has an indirect check. Nothing is tested at the graph level or end to end.
- **Headline counts (tooling):** 5 agreed and delivered (#15–#19), and all 5 pass when run (see [Tooling](#tooling-and-process)). 2 more are proposed but not triaged (#23, #24, both `needs-triage`), and neither is implemented.
- **`uv run pytest`: 57 passed, 0 failed, 0 skipped, in 1.03s.** `uv run pre-commit run --all-files` passes all three hooks.
- **The biggest problem: the `hem` CLI cannot finish a run.** The graph is compiled without a checkpointer, so `graph.aget_state` raises `ValueError: No checkpointer set` as soon as the first Human Review interrupt fires (see [Finding 1](#1-the-hem-cli-crashes-at-the-first-human-review)).

## Agreed scope

### Product behaviour

| ID | Behaviour | Where it is agreed |
|---|---|---|
| F1 | Job Posting given as a URL or raw text. A URL is fetched and reduced to readable text. | `README.md:7`; `.scratch/node-tests/issues/01-parse-job-input-tests.md:7-17` |
| F2 | Structured extraction of 14-field Job Details with Claude Haiku | `README.md:8`; `GLOSSARY.md:19-20,45`; `.scratch/.../02-extract-job-details-tests.md:8-15` |
| F3 | Tailoring: Base Resume + Job Details → Resume Draft at Revision 1. Only rephrase, reorder or emphasise. Nothing is invented. | `README.md:9`; `GLOSSARY.md:22-23,46`; `.scratch/.../03-tailor-resume-tests.md:8-16` |
| F4 | Human Review: write the draft to `<company>_<title>_rev<N>.md` in `~/TailoredResumes` or `$TAILORED_RESUME_DIR`, then interrupt | `README.md:10`; `GLOSSARY.md:33-34,47`; `.scratch/.../04-review-draft-tests.md:8-15` |
| F5 | Revision Feedback produces the next draft at Revision + 1 | `README.md:11`; `GLOSSARY.md:29-31,48`; `.scratch/.../05-revise-resume-tests.md:8-15` |
| F6 | `after_review` routing: `approve` finishes and any other feedback goes to `revise_resume` (case-insensitive, trimmed; null ends) | `README.md:12`; `GLOSSARY.md:49`; `.scratch/.../06-after-review-routing-tests.md:8-14` |
| F7 | Pipeline order: Job Posting → Job Details → Tailoring → Resume Draft → Human Review → (Revision Feedback → Resume Draft)* | `GLOSSARY.md:42`; `README.md:5-12`; `.scratch/node-tests/spec.md:6-12` |
| F8 | Generator nodes stay pure. One idempotent `human_review` node owns the disk write and `interrupt()`, so each LLM call fires once per review cycle. | `docs/adr/0001-split-generator-and-review-nodes.md:3`; `CODING_STANDARDS.md:35` |
| F9 | Output is markdown only. DOCX/PDF rendering stays outside the graph. | `docs/adr/0002-markdown-only-agent-boundary.md:3` |
| F10 | Python 3 + uv + pytest runtime, with the TypeScript code retired after 1:1 test parity | `docs/adr/0003-migrate-to-python-uv-pytest.md:3` |

The `.scratch/node-tests/` spec predates the Python migration. It uses TypeScript names (`parseJobInput`, `reviewDraft`, `rawJobInput`, `draftVersion`) and the term "candidate", which `GLOSSARY.md:9` says to avoid (`.scratch/node-tests/spec.md:4-12`). Every ticket in it says `Status: resolved`, but tickets 02–06 have every acceptance box unchecked (for example `02-extract-job-details-tests.md:3,11-15`). Treat it as historical intent, not a live spec.

`GLOSSARY.md:51-53` records one open gap: accepting a Resume Draft has no domain term yet. The term is deferred to an "interface refactor", and until then `user_feedback`, `TAILORED_RESUME_DIR` and `~/TailoredResumes` keep their names.

### GitHub Issues and PRs

`gh issue list --state all --limit 200` returns 21 issues (#1–#19, #23, #24). Numbers #20–#22 and #25 are PRs.

| Issue | State | Label | Topic |
|---|---|---|---|
| #1 | OPEN | `wayfinder:map` | Map for automated checks. Every decision is resolved, and "Not yet specified" is empty. |
| #2–#13 | CLOSED | `wayfinder:research` / `grilling` / `task` | Decision tickets feeding #14 |
| #14 | CLOSED | `ready-for-agent` | Spec: automated checks. Closing comment: "Delivered in #21 (tickets #15–#19)". |
| #15–#19 | CLOSED | `ready-for-agent` | Ruff gate, pyright gate, pre-commit hook, CI job, `main` ruleset |
| #23 | OPEN | `needs-triage` | Extract a shared chat-model factory |
| #24 | OPEN | `needs-triage` | Align node signatures, guards and tests with `CODING_STANDARDS.md` |

No issue carries `needs-info`, `ready-for-human` or `wontfix`. The `wayfinder:*` labels are not among the five triage roles. They come from the wayfinding conventions in `docs/agents/issue-tracker.md:39-46`.

`gh pr list --state all` returns four PRs:

- #20, merged: vendors the skills.
- #21, merged: delivers the automated checks.
- #22, closed: a CI probe, marked "do not merge".
- #25, merged: adds `CODING_STANDARDS.md`.

No PR has changed product behaviour since the Python migration commit `0ca946a`, which predates the GitHub tracker.

## Implemented

Here is what the code does, read directly from the source.

- **`parse_job_posting`** (`src/hem/nodes/parse_job_posting.py:32-46`). It raises `ValueError("job_posting is required")` on blank input (`:38-39`). Plain text comes back unchanged (`:42-43`). A URL is anything starting with `http://` or `https://` after stripping (`:10-13`). URLs are fetched with `httpx`, following redirects. A status of 400 or above raises `RuntimeError`, and `trafilatura.extract` returning nothing or blank raises too (`:16-29`).
- **`extract_job_details`** (`src/hem/nodes/extract_job_details.py:40-58`). Guard first, then `claude-haiku-4-5-20251001` with `.with_structured_output(JobDetails)` (`:22-37`), sent the system prompt plus the Job Posting. The schema has 14 fields, snake_case with camelCase aliases (`src/hem/types.py:18-36`), and `experience_level` is a 7-value `Literal` (`types.py:7-15`).
- **`tailor_resume`** (`src/hem/nodes/tailor_resume.py:41-76`). Guards on `base_resume` and `job_details` (`:47-52`). It serialises Job Details to JSON by alias (`:54-59`) and calls Haiku with structured output `TailorOutput{thinking, resume}` (`types.py:39-43`). It returns `{"resume_draft", "revision": 1}` (`:76`). The system prompt (`src/hem/prompts/tailor_resume.py:3-308`) holds the truth-preservation rules (`:256-262`).
- **`human_review`** (`src/hem/nodes/human_review.py:10-37`). Guards, then `write_resume_draft(draft, job_details, revision)`, then `interrupt("Draft written to: <path> ... Type 'approve' to finalize...")`. It returns `{"user_feedback": ...}`. Both collaborators are injectable (`:13-14,24-25`).
- **`write_resume_draft`** (`src/hem/utils/write_resume_draft.py:25-43`). The filename is `slugify(company)_slugify(title)_rev{N}.md` (`:35-37`). The directory comes from the argument, then `$TAILORED_RESUME_DIR`, then `~/TailoredResumes` (`:10-15`). It creates parent directories, overwrites any existing file and returns the absolute path.
- **`revise_resume`** (`src/hem/nodes/revise_resume.py:36-65`). It requires `resume_draft`, `user_feedback` and `job_details` (`:42-50`). It sends one `HumanMessage` with the current draft and the feedback, and no system prompt (`:53-59`). It returns `revision + 1` (`:64-65`).
- **`after_review`** (`src/hem/graph.py:13-18`). Missing or empty feedback goes to `END`, `approve` after strip and lower-casing goes to `END`, and anything else goes to `revise_resume`.
- **Graph wiring** (`src/hem/graph.py:21-44`). `START → parse_job_posting → extract_job_details → tailor_resume → human_review`, `revise_resume → human_review`, and a conditional edge out of `human_review`. It is compiled with no checkpointer (`:43`). Running `graph.get_graph()` confirms the nodes and edges, and `graph.checkpointer` is `None`.
- **CLI** (`src/hem/cli.py:14-79`, entry point `hem` at `pyproject.toml:21-22`). `--job` takes a file path, or else the literal value (URL or text). `--resume` must be a file. The CLI streams the graph, then loops on interrupts with `input()` and `aupdate_state(..., as_node="human_review")`. The thread id is hard-coded as `cli_run` (`:16`).
- **LangGraph Studio config** (`langgraph.json:1-8`). It exposes `./src/hem/graph.py:graph` as `agent`. `static/studio.png` exists, but nothing references it.
- **State** (`src/hem/state.py:12-21`). `AgentState` is `total=False`. Its `messages` field (`:15`) is declared, but no node reads or writes it.

Search for stubs: running `grep -rn "TODO\|FIXME\|XXX\|NotImplemented" src/` finds nothing.

## Tested

`uv run pytest -v` on 2026-11-15: **57 collected, 57 passed, 0 failed, 0 skipped, 1.03s** (Python 3.14.3, pytest 9.1.1, pytest-asyncio 1.4.0). All tests run offline. LLM, HTTP, disk and interrupt collaborators are mocks or `tmp_path`.

| Test file | Tests | What the tests actually exercise |
|---|---|---|
| `tests/test_extract_job_details.py` | 14 | **Only the `JobDetails` pydantic schema**: required fields, array types, the `experienceLevel` enum, empty arrays, `"unknown"` strings. It never imports the `extract_job_details` node. |
| `tests/test_tailor_resume.py` | 8 | `TailorOutput` schema (5); node happy path with a mocked model returning `TailorOutput` (`test_tailor_resume_extracts_resume_draft`, `:45-67`); 2 guards that assert the model was never awaited (`:70-97`) |
| `tests/test_human_review.py` | 5 | Writer called with `(draft, job_details, revision)`; the interrupt message contains the path and the `approve` hint; 2 guards; `test_human_review_is_idempotent` (`:92-112`), which calls the node twice with the same mocks and compares the call arguments |
| `tests/test_write_resume_draft.py` | 9 | Creates the directory, writes the content, returns an absolute `.md` path, slugifies the filename, includes the revision, keeps revisions in distinct files, overwrites idempotently, honours `$TAILORED_RESUME_DIR`, `slugify` |
| `tests/test_parse_job_posting.py` | 12 | `is_url`; plain-text and `ftp://` passthrough; URL fetch with patched `httpx.AsyncClient.get` and `trafilatura.extract`; whitespace trimming; HTTP 404; network error; blank input; extraction returning `None` or blank; partial-update shape |
| `tests/test_revise_resume.py` | 4 | Happy path: the draft is replaced, the revision goes from 1 to 2, `user_feedback` is absent from the result, and the model is awaited once. Plus 3 guards that assert the model was never awaited. |
| `tests/test_routing.py` | 5 | `after_review` with `approve`, `Approve`, `"  APPROVE  "`, feedback text, and `None` |

These parts have no test:

- The `extract_job_details` node itself: its guard, the messages it sends and the shape of its return.
- The `get_*_model()` factories (`extract_job_details.py:22`, `tailor_resume.py:23`, `revise_resume.py:18`).
- The content of the messages the `tailor_resume` and `revise_resume` nodes send to the model.
- The `dict` branches in `tailor_resume` (`:56-57,74`).
- The default `~/TailoredResumes` fallback in `get_default_output_dir` (`write_resume_draft.py:10-15`).
- Graph wiring, and any run through the compiled graph, including interrupt and resume.
- `cli.py`.
- `langgraph.json`.

## Feature-by-feature table

| ID | Feature | Agreed where | Implemented? | Tested? | Notes |
|---|---|---|---|---|---|
| F1 | URL-or-text Job Posting ingestion | README:7; scratch 01 | Yes: `nodes/parse_job_posting.py:10-46` | Yes: `test_parse_job_posting.py`, all 12 tests | Guard message differs from `CODING_STANDARDS.md:32` (tracked in #24) |
| F2 | 14-field Job Details extraction (Haiku) | README:8; GLOSSARY:19-20; scratch 02 | Yes: `nodes/extract_job_details.py:22-58`, `types.py:18-36`, `prompts/extract_job_details.py` | **Partial**: schema only (`test_extract_job_details.py`, 14 tests). The node is untested. | Scratch 02 criteria (guard, prompt passing, error propagation) are all unchecked |
| F3 | Tailoring → Revision 1, nothing invented | README:9; GLOSSARY:22-23,46; scratch 03 | Yes: `nodes/tailor_resume.py:41-76`, `prompts/tailor_resume.py` | Yes: `test_tailor_resume.py::test_tailor_resume_extracts_resume_draft` + 2 guards + 5 schema tests | "Nothing invented" is enforced only by prompt text, and no test checks the prompt or model input. The prompt is not generic: see [Finding 4](#4-tailoring-is-hard-wired-to-one-applicant). |
| F4 | Human Review: write `<company>_<title>_rev<N>.md`, then interrupt | README:10; GLOSSARY:33-34; scratch 04 | Yes: `nodes/human_review.py:10-37`, `utils/write_resume_draft.py:10-43` | Yes: `test_human_review.py` (5), `test_write_resume_draft.py` (9) | The default `~/TailoredResumes` path is untested. The interrupt has no "draft summary", which scratch 04:13 asked for. |
| F5 | Revision Feedback → Revision + 1 | README:11; GLOSSARY:29-31,48; scratch 05 | Yes: `nodes/revise_resume.py:36-65` | Yes: `test_revise_resume.py::test_revise_resume_increments_revision_and_updates_draft` + 3 guards | Requires `job_details` but never sends it to the model (`:48-59`). Sends no Base Resume and no truth-preservation rules. See [Finding 3](#3-revise_resume-ignores-the-job-details-it-requires). |
| F6 | `after_review` routing | README:12; GLOSSARY:49; scratch 06 | Yes: `graph.py:13-18` | Yes: `test_routing.py`, 5 tests | Empty or missing feedback also ends the run. The README doesn't say so, so pressing Enter at the CLI prompt counts as accepting the draft. |
| F7 | Pipeline order / graph wiring | GLOSSARY:42; README:5-12 | Yes: `graph.py:21-44` (checked with `graph.get_graph()`) | **No** | No test builds or runs the compiled graph |
| F8 | Pure generators, one idempotent review node (LLM fires once per cycle) | ADR-0001 | Yes, by structure: no disk write or `interrupt` in the generators; `human_review.py` owns both | **No**: `test_human_review_is_idempotent` only compares two mocked calls, and no test runs an interrupt and resume | Scratch 04:15 "does not re-invoke LLM" is unchecked |
| F9 | Markdown-only output | ADR-0002 | Yes: `write_resume_draft.py:37,41` writes `.md`, and there are no rendering dependencies (`pyproject.toml:11-19`) | Indirect: `test_write_resume_draft.py::test_returns_absolute_file_path` asserts the `.md` suffix | Holds |
| F10 | Python/uv/pytest runtime, TypeScript retired | ADR-0003 | Yes: no `.ts` files are tracked; migration commit `0ca946a` | Yes: the 57-test suite runs under `uv run pytest` | `0ca946a` claims 1:1 parity with the Jest suite. The old Jest `extractJobDetails` tests were also schema-only, so parity carried that gap over too. |
| X1 | `hem` CLI (`--job`, `--resume`, interactive review loop) | **None.** It appears only in `pyproject.toml:21-22`, and the README never mentions it. | Yes, but **broken**: `cli.py:14-79` crashes at `:28` | **No** | See [Finding 1](#1-the-hem-cli-crashes-at-the-first-human-review) |
| X2 | LangGraph Studio / `langgraph dev` | **None.** Only `langgraph.json` and the commit message of `0ca946a` mention it. | Config only: `langgraph.json:1-8` | **No** | `static/studio.png` is unreferenced. Not run as part of this research. |

## Tooling and process

All of these were specified in #14 and delivered in PR #21. They are agreed, implemented and verified.

| Item | Agreed | Implemented | Verified |
|---|---|---|---|
| Ruff zero-error gate | #15, #7 | `pyproject.toml:37-50` | `uv run pre-commit run --all-files`: "ruff check ... Passed", "ruff format --check ... Passed" |
| Pyright standard-mode zero-error gate | #16, #4 | `pyproject.toml:52-57` | "pyright ... Passed" |
| Check-only pre-commit hook | #17, #6 | `.pre-commit-config.yaml:1-23` | The same run |
| Single `ci` job | #18, #9 | `.github/workflows/ci.yml:19-47` | `gh run list --branch main`: CI `success` on `dfa69b8` (push) and `9f4241a` (push and dispatch) |
| `main` ruleset | #19, #11 | `.github/rulesets/main.json:1-40` | `gh api repos/AjinkyaK/hem/rules/branches/main` returns `pull_request, required_status_checks, required_linear_history, non_fast_forward, deletion` |
| Coding standards | PR #25 (no issue) | `CODING_STANDARDS.md` | The existing code does not yet conform. The gaps are tracked in #23 and #24 (see [Finding 5](#5-coding_standardsmd-describes-code-that-does-not-exist-yet)). |
| Shared chat-model factory | #23 (`needs-triage`) | **No**: `ChatAnthropic` is built 3 times (`extract_job_details.py:30`, `revise_resume.py:26`, `tailor_resume.py:31`) | n/a |
| Typed seams, `-> AgentState`, guard messages | #24 (`needs-triage`) | **No**: untyped `model=None` (`extract_job_details.py:43`, `tailor_resume.py:44`, `revise_resume.py:39`), `writer_func` and `interrupt_func` (`human_review.py:13-14`); every node returns `-> dict` | n/a |

## Findings and mismatches

### 1. The `hem` CLI crashes at the first Human Review

`graph.py:43` compiles the graph with `builder.compile()` and no checkpointer. `cli.py:28` then calls `graph.aget_state(...)`, and later `aupdate_state`, both of which need one.

I reproduced the crash offline. The script stubbed the two LLM nodes, rebuilt the graph, set `TAILORED_RESUME_DIR` to a scratch directory and ran `hem.cli.run_tailor("Plain text job posting", "# Base resume")`. Its output:

```
🚀 Starting Hem...
✓ Node [parse_job_posting] finished.
✓ Node [extract_job_details] finished.
✓ Node [tailor_resume] finished.
✓ Node [__interrupt__] finished.
RUN_TAILOR ERROR: ValueError No checkpointer set
```

So the Revision 1 file gets written, but the review loop never starts. The only working way to iterate on a draft is probably `langgraph dev` / Studio, where the server provides persistence, but I did not verify that. The CLI has no agreed spec and no test, which is how the crash went unnoticed.

### 2. No product behaviour is tracked in GitHub Issues

All 21 issues cover tooling and process. Product scope lives in the README, the glossary, the ADRs and the TypeScript-era `.scratch/node-tests/` spec. That spec says "resolved" while most of its acceptance criteria stay unchecked, and it uses retired names. Nothing in the tracker records what Hem should do next, or confirms that the scratch criteria still apply.

### 3. `revise_resume` ignores the Job Details it requires

`revise_resume.py:48-50` raises if `job_details` is missing, but the prompt at `:53-59` contains only the current draft and the feedback. It also has no system prompt, no Base Resume and none of the "nothing is invented" rules that Tailoring carries (`prompts/tailor_resume.py:256-262`). That conflicts with the definition of Tailoring at `GLOSSARY.md:23` once a draft enters revision, and with `.scratch/.../05-revise-resume-tests.md:8,13`, which says the prompt includes the Base Resume, Job Details, prior draft and feedback. No test checks what the node sends to the model.

### 4. Tailoring is hard-wired to one Applicant

The glossary defines the Applicant generically: "the person applying", who supplies the Base Resume (`GLOSSARY.md:7-9`). Yet `TAILOR_RESUME_SYSTEM_PROMPT` embeds one specific person's name, employer, years of experience, location, target roles and positioning (`prompts/tailor_resume.py:9-59`). It also includes rephrase examples taken from that person's history (`:208-214`). So for any other Applicant's Base Resume, the model also gets someone else's career context. No doc or issue records this as a decision.

### 5. `CODING_STANDARDS.md` describes code that does not exist yet

`CODING_STANDARDS.md:5` admits that some existing code predates the rules, and the gaps are real:

- Its node example and seam rule (`:17-33`) use typed seams and `-> AgentState`. The code has untyped seams and returns `-> dict`.
- `:39` requires one shared `ChatAnthropic` factory. The code has three.
- `:56` requires whole-return `==` assertions. The tests assert individual keys instead (`test_revise_resume.py:30-32`, `test_tailor_resume.py:64-66`).
- `:53` asks for one test file per module. The schema tests for `hem/types.py` live in `test_extract_job_details.py` and `test_tailor_resume.py`, and no file tests the `extract_job_details` node.

Issues #23 and #24 cover the first two gaps, but both are still `needs-triage`.

### Smaller mismatches

- **The issue #14 spec misdescribes `conftest.py`.** It says LLM calls are "faked in `conftest.py`", but `tests/conftest.py:6-24` holds only the `base_job_details` fixture. The mocks are written in each test.
- **Two docstrings use the pre-rename name.** `cli.py:1` and `utils/__init__.py:1` still say "Resume Tailor" (renamed in `34952ba`).
- **`messages` is dead state.** `AgentState.messages` (`state.py:15`) has an `add_messages` reducer, but nothing uses it.
- **The README has no usage section.** It describes the nodes and the checks, but never says how to run Hem: neither the CLI nor `langgraph dev`.
