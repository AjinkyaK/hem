# Coding Standards

Ruff and pyright (configured in `pyproject.toml`) enforce formatting, imports, Google-style docstrings, and types. This file holds the conventions they can't check.

Some existing code predates a rule here; each gap is tracked as a GitHub issue. Follow the rule, even where the surrounding code doesn't yet.

## Naming

- Name things with [`GLOSSARY.md`](GLOSSARY.md) terms: snake_case in code (`resume_draft`, `job_details`), Capitalized in prose (docstrings, prompts, user-facing messages: "Resume Draft", "Job Details").
- One name per node, shared across the node function, its module `nodes/<node>.py`, its graph node id, and its prompt module `prompts/<node>.py`.

## Nodes

A node has this shape:

```python
async def tailor_resume(
    state: AgentState,
    _config: RunnableConfig | None = None,
    model: Runnable | None = None,
) -> AgentState:
    """Generate the initial Resume Draft from the Base Resume and Job Details."""
    base_resume = state.get("base_resume", "")
    if not base_resume or not base_resume.strip():
        raise ValueError("tailor_resume: base_resume is empty")

    structured_model = model if model is not None else get_structured_model()
    ...
    return {"resume_draft": resume_text, "revision": 1}
```

- **Guards first.** Read each required field with `state.get(...)` and validate it before any model call or side effect. Raise `ValueError("<node>: <field> is empty")` for a blank string and `ValueError("<node>: <field> is null")` for a missing value.
- **Seams.** Every collaborator a node calls (chat model, disk writer, `interrupt`) is a keyword parameter with a type annotation and a `None` default, resolved as `dep if dep is not None else <default>`. Tests replace collaborators through these seams.
- **Partial update.** Annotate the return as `AgentState` and return only the keys the node changes.
- **Pure generators.** `extract_job_details`, `tailor_resume`, and `revise_resume` only transform state. Disk writes and `interrupt()` belong in `human_review`, which must stay idempotent because LangGraph re-runs it on resume ([ADR-0001](docs/adr/0001-split-generator-and-review-nodes.md)).

## Models and schemas

- Construct `ChatAnthropic` in one shared factory, and define the model id once. Nodes call the factory and add `.with_structured_output(...)` where they need it.
- Structured-output schemas are pydantic models in `types.py`. Fields are snake_case in Python, with camelCase `Field(alias=...)` for the LLM and `populate_by_name=True`.
- System prompts are `<NODE>_SYSTEM_PROMPT` string constants in `prompts/<node>.py`. The node builds the `HumanMessage` from state.

## State

`AgentState` in `state.py` is the graph's only state. It is `total=False`, so read every key with `.get()`.

## Comments

Write a comment only for a reason the code can't show: a library gotcha, a behaviour you must keep, a non-obvious constraint. The API-key comment above the `ChatAnthropic` call is the model to follow.

## Tests

- One file per module, `tests/test_<module>.py`, of plain `test_<behaviour>` functions whose names read as a sentence.
- Build `JobDetails` from the `base_job_details` fixture in `tests/conftest.py`.
- Pass `AsyncMock` / `MagicMock` collaborators through the node's seams. In a guard test, also assert the model was never awaited (`await_count == 0`).
- Assert a node's whole return with `==` (`assert result == {"resume_draft": ..., "revision": 2}`), which also proves it is a partial update.
- A test that deliberately passes invalid input to check validation may silence that one line with `# pyright: ignore[<rule>]`, naming the rule. That is the only place a suppression is allowed.
