# Pyright integration with pydantic, LangGraph and uv

Research for [#2](https://github.com/AjinkyaK/hem/issues/2) (map: [#1](https://github.com/AjinkyaK/hem/issues/1)). Gathered 2026-11-14.

Pyright was already chosen, so this note covers only how to integrate it. It does not compare it with other checkers.

## Answer in brief

- **Distribution:** add **`pyright[nodejs]`** to the `dev` dependency group and run it with `uv run pyright`.
  - The PyPI wheel already includes pyright's JavaScript.
  - The `nodejs` extra installs a Node binary from a PyPI wheel (`nodejs-wheel-binaries`), and `uv.lock` pins it.
  - So there is no system Node, no `npm install` and no Node download at runtime.
  - basedpyright distributes Node the same way (it *hard*-depends on `nodejs-wheel-binaries`), so it is not "Node-free" either.
  - Neither option avoids Node entirely, because pyright is written in TypeScript. What both avoid is a Node toolchain that you manage yourself.
- **Config:** use `[tool.pyright]` in `pyproject.toml` with `venvPath = "."`, `venv = ".venv"`, `pythonVersion = "3.11"`, `include = ["src", "tests"]` and `typeCheckingMode = "standard"`.
- **Current state of the repo:** a trial run found **48 errors in `standard`** (the same 48 in `basic`) and **689 in `strict`**.
  - Most of them are real type mismatches that are easy to fix, such as untyped dict literals passed where `AgentState` or `RunnableConfig` is expected.
  - About 6 are library-induced false positives on `ChatAnthropic(...)`.
  - The checks spec needs to decide whether to fix these errors first or to start from a baseline. See "Implications for the map".

## (a) Distribution under uv

### PyPI `pyright` (pyright-python wrapper)

Facts below come from reading the installed wheel, `pyright==1.1.414` (released 2026-09-10), and its [PyPI page](https://pypi.org/project/pyright/).

- **Pyright's JavaScript is bundled in the wheel.** The wheel contains `pyright/dist/index.js`.
  - `_utils.install_pyright()` returns that bundled path when the configured version equals the wheel's own version and `PYRIGHT_PYTHON_USE_BUNDLED_PYRIGHT` is unset or true.
  - It falls back to `npm install pyright@<version>` into `~/.cache/pyright-python/<version>` only when you override the version with `PYRIGHT_PYTHON_FORCE_VERSION`.
  - The PyPI README still describes the older npm-install flow, but the code no longer works that way.
- **How Node is resolved** (`pyright/node.py`, `_resolve_strategy`). The order is:
  1. The `nodejs_wheel` module, if it is importable. `PYRIGHT_PYTHON_NODEJS_WHEEL` controls this and defaults to on.
  2. A global `node` on `PATH` (`PYRIGHT_PYTHON_GLOBAL_NODE`, default on).
  3. **nodeenv**: downloads a Node build at runtime into `~/.cache/nodeenv`.
- **Dependencies** (from the wheel METADATA):
  - Always: `nodeenv>=1.6.0` and `typing-extensions`.
  - With `extra == "nodejs"`: `nodejs-wheel-binaries`.
- What this means in practice:
  - **Plain `pyright`** uses whatever `node` is on `PATH`. This machine has an nvm Node 24, so results would differ between machines. When there is no Node on `PATH` (for example in a bare CI runner image), it downloads Node at runtime through nodeenv. That download is the behaviour the user objected to.
  - **`pyright[nodejs]`** always uses the Node from `nodejs-wheel-binaries`, because that strategy is checked first. The Node binary comes from PyPI, `uv.lock` pins it with hashes, and uv caches it like any other wheel. When the trial ran, `uvx --from 'pyright[nodejs]'` installed `nodejs-wheel-binaries 24.19.0`, which is about 53 MB per platform.
  - The PyPI README itself says: *"It's highly recommended to install `pyright` with the `nodejs` extra which uses nodejs-wheel to download Node.js binaries as it is more reliable than the default nodeenv solution."*
- **One residual network call:** when it prints the "new pyright version available" warning, the wrapper calls the PyPI JSON API through `get_latest_version()`, with a 1 s timeout. The call fails silently when offline.
  - Setting `PYRIGHT_PYTHON_IGNORE_WARNINGS=1` turns it off.
  - It is also skipped automatically with `--outputjson` and in the language server.
  - Set this variable in CI to keep runs hermetic.
- **Version pinning:** each wrapper release targets exactly one pyright version (`1.1.414` ↔ `pyright==1.1.414`). Pinning the PyPI package in `uv.lock` therefore pins the checker.

### basedpyright

Sources: [PyPI](https://pypi.org/project/basedpyright/), [install docs](https://docs.basedpyright.com/latest/installation/command-line-and-language-server/), [config docs](https://docs.basedpyright.com/latest/configuration/config-files/) and the installed wheel.

- `basedpyright==1.40.2` (2026-10-04) reports *"based on pyright 1.1.414"*. That is the same pyright core as the latest upstream wrapper, so there is no version lag today.
- Its wheel METADATA has an **unconditional** `Requires-Dist: nodejs-wheel-binaries>=20.13.1`. Node comes from PyPI exactly as with `pyright[nodejs]`. The docs recommend `uv add --dev basedpyright`.
- It is a fork with extra rules and Pylance-like language-server features. Two things matter here:
  - **The default `typeCheckingMode` is `"recommended"`.** That mode turns every rule on as a warning or error and sets `failOnWarnings = true`. If you adopt it, pin `typeCheckingMode = "standard"` explicitly to get upstream semantics.
  - **Baseline:** `basedpyright --writebaseline` writes `./.basedpyright/baseline.json`. You commit that file, and diagnostics already in it are suppressed. By default the file is *auto-rewritten* as errors go away. `baselineMode` (for example `discard`) stops that, which matters in CI. ([baseline docs](https://docs.basedpyright.com/latest/benefits-over-pyright/baseline/))
- It reads `[tool.basedpyright]`, and also `[tool.pyright]` for backwards compatibility.
- The trade-off: it is a community fork, not Microsoft upstream. Its diagnostics and defaults can diverge from what Pylance shows in VS Code.

### Recommendation

| | `pyright` (plain) | `pyright[nodejs]` | `basedpyright` |
|---|---|---|---|
| Node source | `PATH`, else nodeenv **runtime download** | PyPI wheel, locked | PyPI wheel, locked |
| Pyright JS | bundled in wheel | bundled in wheel | bundled in wheel |
| Upstream semantics | yes | yes | fork; default mode stricter |
| Baseline support | no | no | yes |

Use **`pyright[nodejs]`** in `[dependency-groups].dev`. It is upstream pyright (what was chosen, and what Pylance uses), and it satisfies "no Node to install or manage". Consider basedpyright only if you want its baseline feature to adopt checking without first fixing the 48 existing errors.

## (b) Pydantic v2

- **How it works:** pydantic's `ModelMetaclass` is decorated with `@dataclass_transform(kw_only_default=True, field_specifiers=(PydanticModelField, PydanticModelPrivateAttr, NoInitField))`. You can see this in `pydantic/_internal/_model_construction.py` in pydantic 2.14.1 as installed. Pyright therefore synthesizes a keyword-only `__init__` from the field annotations, and no plugin is needed ([pydantic VS Code/Pylance docs](https://pydantic.dev/docs/validation/latest/integrations/dev-tools/visual_studio_code/)).
- **`model_validate`, `model_dump` and `field_validator`** type-check cleanly.
  - `M.model_validate({...})` is revealed as `M`.
  - A `@field_validator` stacked on a `@classmethod` raised no diagnostics. This was verified with a scratch file in `standard` mode.
- **Known false positives.** Both come from the [dataclass_transform spec](https://typing.python.org/en/latest/spec/dataclasses.html) and were reproduced locally.
  1. **A positional default is not seen as a default.** The spec says the standardized field-specifier parameters "must be keyword-only". So `x: int | None = Field(None, alias="xx")` is treated as **required**. Pydantic's docs say: "a limitation of dataclass transforms and cannot be fixed in pydantic." Write `Field(default=None, ...)` instead.
  2. **`alias` replaces the `__init__` parameter name, and `populate_by_name` / `validate_by_name` are invisible to pyright.** The spec says the alias "is used in the synthesized `__init__` method". `M(a=...)` therefore errors with *"No parameter named 'a'"* even though it works at runtime. Only `M(aa=...)` type-checks.
- **Pydantic's leniency is not modelled.** `Model(age="23")` is flagged even though pydantic would coerce the value. Tests in this repo deliberately pass invalid types to check validation (for example `tests/test_tailor_resume.py:33,35`), and those lines will be flagged. The documented workarounds:
  - a `# pyright: ignore[<rule>]` comment
  - casting the argument to `Any`
  - constructing through `Model.model_validate({...})`, which takes a `dict` and is not checked against the fields. This is the cleanest option for "invalid input" tests.
- **This repo's own models:** `src/hem/types.py` uses `Field(alias=...)` with camelCase aliases and `populate_by_name`. Pyright accepts only the alias names (`requiredSkills=...`), so test code must construct with aliases or go through `model_validate`. See `tests/test_extract_job_details.py:18`.

## (c) LangGraph / LangChain typing

### py.typed status (installed versions)

| Package | Version | `py.typed` | Note |
|---|---|---|---|
| `langgraph` | 1.2.16 | at `langgraph/py.typed` | **namespace package** (no `langgraph/__init__.py`); see below |
| `langgraph.prebuilt` | 1.1.1 | `langgraph/prebuilt/py.typed` | in-subpackage marker |
| `langgraph-checkpoint` | 4.3.0 | none in `langgraph/checkpoint/` | |
| `langgraph_sdk` | 0.4.8 | yes | |
| `langchain_core` | 1.7.0 | yes | |
| `langchain_anthropic` | 1.7.6 | yes | |
| `pydantic` / `anthropic` / `httpx` / `trafilatura` | 2.14.1 / 1.17.0 / – / 2.3.1 | yes | |

- `langgraph` is a PEP 420 namespace package that several distributions share (`langgraph`, `langgraph-checkpoint`, `langgraph-prebuilt`, and others).
- [PEP 561](https://peps.python.org/pep-0561/) says that for namespace packages "the `py.typed` file should be in the submodules of the namespace". Pyright therefore treats `langgraph.graph` and `langgraph.graph.message` as having no stubs and no `py.typed`.
- It still reads their inline annotations, because `useLibraryCodeForTypes` defaults to `true`.
- The visible effect appears only in `strict`, where `reportMissingTypeStubs` fires on `from langgraph.graph import ...` (3 hits). That rule is `"none"` in basic and standard ([config defaults table](https://github.com/microsoft/pyright/blob/main/docs/configuration.md)).

### Settings that matter

- **`useLibraryCodeForTypes`:** defaults to `true`, so leave it alone. It is what lets pyright use the annotations in the `langgraph` namespace package.
- **`reportMissingTypeStubs`:** `"none"` in standard, so there is nothing to do. If you ever use strict, set it to `"none"` or `"warning"`, or you get false noise on `langgraph.*`.

### API-level observations

These come from the installed source and the trial run.

- **`StateGraph`:**
  - It is `Generic[StateT, ContextT, InputT, OutputT]` (`langgraph/graph/state.py:131`).
  - `StateGraph(AgentState)` infers `StateT = AgentState`.
  - The compiled graph's `astream`/`ainvoke` are typed `input: AgentState | Command[Unknown] | None, config: RunnableConfig | None`.
  - So `graph.astream({"job_posting": ...}, {"configurable": {...}})` with plain dict literals stored in un-annotated variables is **rejected** (`dict[str, str]` is not `AgentState`). The fix is to annotate, for example `state: AgentState = {...}` and `config: RunnableConfig = {...}`. This accounts for 6 errors in `cli.py` and about 30 in `tests/`.
- **`TypedDict` state:** `AgentState(TypedDict, total=False)` makes every key optional. `reportTypedDictNotRequiredAccess` (an error in basic and standard) then flags `state["job_posting"]` in `parse_job_posting.py:43`. Fix it with `.get()` or by marking always-present keys `Required[...]`.
- **`interrupt`:** in langgraph 1.2 it has overloads.
  - `interrupt(value, *, response_schema: type[T]) -> T`
  - otherwise it returns `-> Any`
  - So `user_feedback = interrupt(...)` is `Any` unless you pass `response_schema=str`.
- **`Command`:** it is `Generic[N]`, where `N` is the node-name type, for example `Command[Literal["revise_resume"]]`.
- **`with_structured_output`** (`langchain_anthropic/chat_models.py:2866`):
  - It returns `Runnable[LanguageModelInput, dict | BaseModel]`, not the schema type.
  - In `tailor_resume.py:57`, `isinstance(result, TailorOutput)` narrows the else-branch to `dict | BaseModel`, and `result["resume"]` then errors (`reportIndexIssue`).
  - Use `cast(TailorOutput, ...)` or `isinstance(result, dict)` in the else-branch.
- **`ChatAnthropic(model=..., ...)` false positive:** this pairs langchain-anthropic with the pydantic caveats above. In `langchain_anthropic/chat_models.py`:
  - `model: str = Field(alias="model_name")`, so pyright only accepts `model_name=`. The docs and this repo use `model=`, which works at runtime via `populate_by_name=True`.
  - `default_request_timeout: float | None = Field(None, alias="timeout")` and `stop_sequences: ... = Field(None, alias="stop")` use **positional** defaults, so pyright treats `timeout` and `stop` as **required**.
  - Result: "Arguments missing for parameters 'model_name', 'timeout', 'stop'" plus "No parameter named 'model'" at each of the 3 `ChatAnthropic(...)` sites, 6 errors in total.
  - Workaround: pass `model_name=..., timeout=None, stop=None`, or add a scoped `# pyright: ignore[reportCallIssue]` in each `_build_*_model()` helper.

## (d) Config surface

From [pyright `configuration.md`](https://github.com/microsoft/pyright/blob/main/docs/configuration.md) and [`import-resolution.md`](https://github.com/microsoft/pyright/blob/main/docs/import-resolution.md):

- **`[tool.pyright]` in `pyproject.toml`** is supported. A `pyrightconfig.json` "always takes precedent" if one exists, so keep only one.
- **Environment selection:** with no `venvPath`/`venv`, pyright uses the editor's selected interpreter or "the default Python environment (i.e. the one that is invoked when typing `python` in the shell)".
  - `uv run pyright` happens to work, because uv puts `.venv/bin` first on `PATH`.
  - A bare `pyright` call, an editor, or a hook running outside `uv run` might not pick up the venv.
  - Set both values explicitly: `venvPath` is the directory *containing* the venv (`"."`) and `venv` is its name (`".venv"`).
- **`pythonVersion = "3.11"`:** `.python-version` and the dev venv are **3.14**, but `requires-python = ">=3.11"`. Without this setting, pyright would accept 3.12+ only syntax and stdlib APIs.
- **Modes:**
  - `basic` and `standard` differ in a handful of rules. Upstream defaults to `standard`.
  - On this codebase both give the same 48 errors.
  - `strict` gives 689 errors: 392 `reportUnknownArgumentType`, 80 `reportUnknownVariableType`, 51 `reportUnknownParameterType`, 44 `reportMissingParameterType`, and so on. Most come from `MagicMock`-heavy tests and `Unknown` leaking from LangChain generics. On `src/` alone it gives 92.
  - Strict is not a practical gate today. The `strict = ["src/hem/types.py", ...]` list can opt individual files in later.

Suggested starting block (not applied; it belongs to the spec):

```toml
[tool.pyright]
include = ["src", "tests"]
venvPath = "."
venv = ".venv"
pythonVersion = "3.11"
typeCheckingMode = "standard"
# useLibraryCodeForTypes = true   # default; required for langgraph namespace pkg
```

## Trial-run method

- The trial ran against `src/` and `tests/` copied to a scratch directory, with the project's `.venv` symlinked in.
- The checkers came from the uv cache: `uvx --from 'pyright[nodejs]' pyright` (1.1.414) and `uvx basedpyright` (1.40.2).
- Nothing was added to the project.

Per-rule counts in `standard` (48):

| Rule | Count |
|---|---|
| `reportArgumentType` | 37 |
| `reportCallIssue` | 9 |
| `reportIndexIssue` | 1 |
| `reportTypedDictNotRequiredAccess` | 1 |

## Implications for the map

- **Adoption strategy is a new decision.** Gating CI on pyright requires one of:
  1. a cleanup ticket that fixes the 48 errors first. Most are mechanical annotations plus 6 `ChatAnthropic` ignores. That touches `src/` and `tests/`, which is in tension with the "no new tests or restructuring" note, although only annotations change.
  2. starting in `basic` with per-rule downgrades.
  3. switching to basedpyright for its baseline.
- **CI:** set `PYRIGHT_PYTHON_IGNORE_WARNINGS=1`. The Node wheel (about 53 MB) is cached along with the uv cache.
- **Hooks:** running `uv run pyright` adds no Node setup step on machines that don't have Node.
