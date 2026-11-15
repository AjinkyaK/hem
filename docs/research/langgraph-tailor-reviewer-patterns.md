# LangGraph patterns for a tailor-and-reviewer agent

A beginner's guide to the ways Hem can have one model write a Resume Draft while a second model critiques it in a loop, with no human input after launch. It covers what each way costs in complexity, how to cap the loop, how to get a structured verdict from the reviewer, how to test each way offline, and whether you need a checkpointer.

Answers [#29](https://github.com/AjinkyaK/hem/issues/29), a child of the map issue [#27](https://github.com/AjinkyaK/hem/issues/27).

**Versions researched** (from `uv.lock` on `main`, 2026-11-15):

| Package | Locked version | Notes |
|---|---|---|
| `langgraph` | 1.2.16 | |
| `langgraph-prebuilt` | 1.1.1 | Pulled in by `langgraph`. Holds `ToolNode`, `tools_condition` and the deprecated `create_react_agent`. |
| `langgraph-checkpoint` | 4.3.0 | Holds `InMemorySaver`. |
| `langchain-core` | 1.7.0 | Holds the fake chat models. |
| `langchain-anthropic` | 1.7.6 | |
| `langchain` | **not installed** | `create_agent` lives here. Patterns B, C and D need `uv add langchain`. I tested them with `langchain` 1.4.7, the newest release that resolves against `langchain-core` 1.7.0. |

**How the claims were checked.** Behaviour claims were read from the installed package source (`.venv/lib/python3.14/site-packages/...`), which is the primary source for these exact versions. Every code sketch below was run in a scratch venv pinned to the versions above, and passed under `pytest`. Where the docs and the source disagree, this guide follows the source and says so.

---

## The answer in brief

1. **There are four shapes**, from least to most autonomous. **A:** a fixed `StateGraph` loop of tailor, review, repeat (Anthropic calls this the *evaluator–optimizer workflow*). **B:** one tool-calling agent that decides its own steps and calls the reviewer as a tool. **C:** a supervisor agent that delegates to a tailor sub-agent and a reviewer sub-agent. **D:** a hybrid, where A's fixed outer loop runs a tool-calling agent as its tailor step.
2. **Complexity grows A < D < B < C.** That is roughly the order of how hard each is to predict, test and debug. B and C let the model decide whether a review even happens. Only A and D guarantee a review on every round.
3. **Cap the loop in state, and keep `recursion_limit` as a backstop.** Keep a `review_rounds` counter in state and route to a `finish` node when it hits the cap. `recursion_limit` defaults to **10,007** super-steps in langgraph 1.2.16, not the 25 that older posts quote. Hitting it raises `GraphRecursionError`, and you get no final state back. For `create_agent`, use `ModelCallLimitMiddleware(run_limit=N)`, which ends the run cleanly.
4. **Get the reviewer's verdict with `model.with_structured_output(Review)`**, where `Review` is a pydantic model with `verdict: Literal["approve", "revise"]` and a `critique` list. `ChatAnthropic` does this with forced tool calling by default (`method="function_calling"`). If you later switch on extended thinking or move to a model that does not support forced tool use, switch to `method="json_schema"`.
5. **Test offline with `GenericFakeChatModel`** from `langchain_core`, subclassed so that `bind_tools` returns `self`. Script reviewer turns as `AIMessage(tool_calls=[{"name": "Review", ...}])`. The plain fakes raise `NotImplementedError` from `with_structured_output`. Hem's current style of injecting an `AsyncMock` through the node's `model` seam also still works for Pattern A.
6. **A no-human run does not need a checkpointer.** `graph.invoke(...)` runs to the end without one. You need one only for `interrupt()`, for `get_state` or `get_state_history` (both raise `ValueError: No checkpointer set` without one), for resuming a crashed run, and for `thread_limit` middleware. `langgraph dev` refuses a module-level graph compiled with its own checkpointer, so if you want one, compile a second copy in the CLI.
7. **Recommended for Hem's MVP: Pattern A, built so its tailor node can later become Pattern D.** It is the closest to today's graph, guarantees every draft is reviewed, gives a hard stop, needs no new dependency, and is the easiest to test. It is a *workflow* by Anthropic's definition. The model's judgement still drives the loop, because the reviewer's verdict decides whether another round runs. Make the tailor node an agent (Pattern D) once it has a tool that earns its place. The strongest candidate is a "check this claim against the Base Resume" tool, which enforces Tailoring's "nothing is invented" rule.

---

## Part 1: The concepts, in plain terms

Read this once. The patterns below name these concepts without re-explaining them.

### Workflow versus agent

Anthropic's *Building effective agents* draws the line this way:

- A **workflow** is a system "where LLMs and tools are orchestrated through predefined code paths". You, the programmer, decide the steps.
- An **agent** is a system where "LLMs dynamically direct their own processes and tool usage". The model decides the steps.

The same article's main advice is to find "the simplest solution possible, and only increasing complexity when needed". It also warns that frameworks "can add abstraction layers that obscure prompts and responses, making debugging harder". The LangGraph docs draw the same line: "Workflows have predetermined code paths… Agents are dynamic and define their own processes and tool usage."

"Agentic" is a spectrum, not a switch. A workflow where a model's output picks the next step (the reviewer saying "revise") already hands the model some control. An agent hands it all of the control.

### LangGraph building blocks

| Concept | What it is, plainly | In code |
|---|---|---|
| **State** | One shared dictionary that every step reads from and writes to. You declare its keys and types up front. | A `TypedDict`, like Hem's `AgentState` in `src/hem/state.py`. |
| **Node** | One step. A plain Python function (sync or async) that receives the state and returns *only the keys it changed*. LangGraph merges that partial update into the state. | `builder.add_node("review", review)` |
| **Reducer** | The rule for merging a node's update into a key. With no reducer, the new value replaces the old one. With a reducer, such as `add_messages`, values are combined (appended). | `messages: Annotated[list[BaseMessage], add_messages]` |
| **Edge** | A fixed arrow: after node X, always run node Y. | `builder.add_edge("tailor", "review")` |
| **Conditional edge** | A fork in the road. After node X, a small *routing function* looks at the state and returns the name of the next node. Hem already has one, `after_review`. | `builder.add_conditional_edges("review", after_review, {...})` |
| **`START` / `END`** | Built-in markers for where the graph begins and where a path stops. | `from langgraph.graph import START, END` |
| **Builder and compile** | `StateGraph(State)` is the blueprint. `.compile()` checks it (for example, for orphaned nodes) and returns a runnable graph with `invoke` / `ainvoke` / `stream`. Runtime extras, such as a checkpointer, attach at compile time. | `graph = builder.compile()` |
| **Super-step** | One "tick" of the graph. Every node scheduled for that tick runs, and then their updates are applied. Nodes in sequence use one super-step each. Nodes in parallel share one. | |
| **`recursion_limit`** | The most super-steps one run may take before LangGraph gives up with `GraphRecursionError`. It is a safety net against infinite loops. | `graph.invoke(state, {"recursion_limit": 20})` |
| **Managed value (`RemainingSteps`)** | A read-only state key that LangGraph fills in for you, giving the number of super-steps left before the recursion limit. | `remaining_steps: RemainingSteps` |
| **Checkpointer** | Saves a snapshot of the state after every super-step, filed under a `thread_id`. It makes pausing, resuming, crash recovery and history inspection possible. | `builder.compile(checkpointer=InMemorySaver())` |
| **`thread_id`** | The name of one run's save slot. Reuse it to continue a run. Use a new one to start fresh. | `{"configurable": {"thread_id": "run-1"}}` |
| **`interrupt()`** | Pauses the graph inside a node and waits for outside input. It needs a checkpointer, because the paused run has to be stored somewhere. Hem's `human_review` node uses it today. | `from langgraph.types import interrupt` |
| **Subgraph** | A compiled graph used as a node inside another graph. You can add it directly (if it shares state keys) or call it from inside a node function (if it does not). | `builder.add_node("tailor", tailor_agent)` |
| **`Command`** | A node's return value that both updates state *and* names the next node, so the routing decision can live inside the node. It is an alternative to conditional edges and is not needed here. | `return Command(update={...}, goto="review")` |

### LangChain building blocks

| Concept | What it is, plainly |
|---|---|
| **Chat model** | A wrapper around an LLM API, such as `ChatAnthropic`. It takes a list of messages and returns an `AIMessage`. |
| **Tool** | A Python function the model is allowed to ask you to run. The `@tool` decorator turns the function's name, docstring and type hints into a schema the model can read. |
| **Tool calling** | The model replies not with text but with an `AIMessage` whose `tool_calls` list says "run tool X with arguments Y". Your code (or a prebuilt `ToolNode`) runs the tool and sends the result back as a `ToolMessage`. Then the model goes again. |
| **`bind_tools`** | Attaches tool schemas to a model so that it can emit tool calls. |
| **Structured output** | Making the model return data that fits a schema (a pydantic class) instead of free text. `with_structured_output(Schema)` hides the mechanics and hands you a validated pydantic object. |
| **`create_agent`** | LangChain 1.x's ready-made agent: a compiled LangGraph graph that loops *model → tools → model* until the model replies without a tool call. It lives in the separate `langchain` package (`from langchain.agents import create_agent`). |
| **Middleware** | Hooks that `create_agent` runs around each model or tool call. Use them for call limits, retries, summarisation and similar jobs. |

---

## Part 2: The four patterns

Every sketch uses this shared reviewer schema. In Hem, it would live in `src/hem/types.py`, following `CODING_STANDARDS.md`. That means snake_case fields, plus camelCase aliases if you keep that convention.

```python
from typing import Literal

from pydantic import BaseModel, Field


class Review(BaseModel):
    """The reviewer's verdict on one Resume Draft."""

    verdict: Literal["approve", "revise"] = Field(
        description="approve if the draft is ready, revise otherwise"
    )
    critique: list[str] = Field(
        default_factory=list, description="Concrete changes the tailor should make"
    )
```

### Pattern A: evaluator–optimizer workflow (a fixed `StateGraph` loop)

**What it is.** This is Anthropic's evaluator–optimizer: "one LLM call generates a response while another provides evaluation and feedback in a loop". Anthropic says it fits "when we have clear evaluation criteria, and when iterative refinement provides measurable value". The LangGraph docs give it as a worked example ("Evaluator-optimizer" in *Workflows and agents*). There, a joke generator loops with a grader whose `with_structured_output(Feedback)` verdict routes either to `END` or back to the generator.

**Concepts used:** state, nodes, edges, a conditional edge, a loop counter in state, structured output.

```text
START → tailor → review ─┬─ verdict = approve ─────────→ finish → END
           ↑             ├─ rounds ≥ MAX_REVIEW_ROUNDS ─→ finish
           └── revise ───┘
```

```python
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph
from typing_extensions import TypedDict

MAX_REVIEW_ROUNDS = 3


class TailorState(TypedDict, total=False):
    base_resume: str
    job_details: str
    resume_draft: str
    revision: int
    review: Review | None
    review_rounds: int
    stop_reason: str


def build_graph(tailor_model: BaseChatModel, reviewer_model: BaseChatModel):
    reviewer = reviewer_model.with_structured_output(Review)

    async def tailor(state: TailorState) -> dict:
        review = state.get("review")
        ask = (
            "Write a Resume Draft."
            if review is None
            else "Revise the draft. Critique:\n- " + "\n- ".join(review.critique)
        )
        msg = await tailor_model.ainvoke([
            SystemMessage("You tailor resumes. Invent nothing."),
            HumanMessage(
                f"{ask}\n\nBase Resume:\n{state['base_resume']}\n\n"
                f"Job Details:\n{state['job_details']}\n\n"
                f"Current draft:\n{state.get('resume_draft', '(none)')}"
            ),
        ])
        return {"resume_draft": msg.text, "revision": state.get("revision", 0) + 1}

    async def review(state: TailorState) -> dict:
        verdict = await reviewer.ainvoke([
            SystemMessage("You review tailored resumes against the job."),
            HumanMessage(state["resume_draft"]),
        ])
        return {"review": verdict, "review_rounds": state.get("review_rounds", 0) + 1}

    def after_review(state: TailorState) -> str:
        review = state.get("review")
        if review is not None and review.verdict == "approve":
            return "approved"
        if state.get("review_rounds", 0) >= MAX_REVIEW_ROUNDS:
            return "out_of_rounds"
        return "revise"

    async def finish(state: TailorState) -> dict:
        review = state.get("review")
        approved = review is not None and review.verdict == "approve"
        return {"stop_reason": "approved" if approved else "out_of_rounds"}

    builder = StateGraph(TailorState)
    builder.add_node("tailor", tailor)
    builder.add_node("review", review)
    builder.add_node("finish", finish)
    builder.add_edge(START, "tailor")
    builder.add_edge("tailor", "review")
    builder.add_conditional_edges(
        "review",
        after_review,
        {"revise": "tailor", "approved": "finish", "out_of_rounds": "finish"},
    )
    builder.add_edge("finish", END)
    return builder.compile()
```

In Hem itself, each node would follow the shape in `CODING_STANDARDS.md`. That means guards first, the model passed as a `model=None` keyword seam, and the model built by the shared factory. Today's `tailor_resume` and `revise_resume` would stay as separate nodes, and `human_review` would be replaced by `review_resume`. The sketch above passes models into a builder only to keep it short.

**Trade-offs.**

- Pro: Predictable. The review *always* runs, the loop *always* stops at the cap, and every run takes the same path through the code.
- Pro: The cheapest pattern to test. Each node is a plain function, and the router is a pure function, so it can be tested with no model at all (as `tests/test_routing.py` already does).
- Pro: Two model calls per round, with nothing wasted on the model deciding what to do next.
- Pro: No new dependency, and close to the current `src/hem/graph.py`.
- Con: The tailor cannot *do* anything except write. It cannot look things up, check a claim or decide to skip a step. If a draft needs a different strategy, you have to change the code.
- Con: Anthropic classes this as a workflow, not an agent.

**Testing offline.** See [Part 5](#part-5-testing-offline-with-fake-models) for the fake. The key tests are "approves on round 2", "stops at the cap" and a pure test of `after_review`.

```python
async def test_approves_on_second_round():
    tailor = GenericFakeChatModel(messages=iter(["draft 1", "draft 2"]))
    reviewer = FakeToolCallingModel(
        messages=iter([review_call("revise", "Lead with Python"), review_call("approve")])
    )
    result = await build_graph(tailor, reviewer).ainvoke(
        {"base_resume": "# Jane", "job_details": "{}"}
    )
    assert result["resume_draft"] == "draft 2"
    assert result["stop_reason"] == "approved"


async def test_stops_at_round_cap():
    tailor = GenericFakeChatModel(messages=iter([f"d{i}" for i in range(10)]))
    reviewer = FakeToolCallingModel(messages=iter([review_call("revise", "again")] * 10))
    result = await build_graph(tailor, reviewer).ainvoke(
        {"base_resume": "# Jane", "job_details": "{}"}
    )
    assert result["review_rounds"] == MAX_REVIEW_ROUNDS
    assert result["stop_reason"] == "out_of_rounds"
```

### Pattern B: a single tool-calling agent (`create_agent`)

**What it is.** One model in a loop with tools. It decides which tools to call, in what order and when it is done. The reviewer becomes a tool (`review_draft`) the agent can call whenever it wants. This is Anthropic's "agent": "LLMs dynamically direct their own processes and tool usage".

**Concepts used:** tools, tool calling, `create_agent` (which builds a LangGraph graph for you), `response_format` (structured final answer), middleware (call limits).

**Which function?** In langgraph-prebuilt 1.1.1, `langgraph.prebuilt.create_react_agent` is marked `@deprecated` with the message "create_react_agent has been moved to `langchain.agents`. Please update your import to `from langchain.agents import create_agent`." Use `create_agent`, which means adding the `langchain` package. If you want to stay on LangGraph alone, you can hand-roll the same loop with `ToolNode` and `tools_condition` from `langgraph.prebuilt` (still supported). The LangGraph docs' "Agent" example in *Workflows and agents* shows how.

```python
from langchain.agents import create_agent
from langchain.agents.middleware import ModelCallLimitMiddleware
from langchain.tools import tool
from pydantic import BaseModel


class FinalDraft(BaseModel):
    """The Resume Draft the agent submits as finished."""

    resume_markdown: str
    notes: str


def build_agent(agent_model, reviewer_model, base_resume: str):
    reviewer = reviewer_model.with_structured_output(Review)

    @tool
    def review_draft(resume_markdown: str) -> str:
        """Ask the reviewer to critique a Resume Draft. Returns verdict and critique."""
        return reviewer.invoke(resume_markdown).model_dump_json()

    @tool
    def search_base_resume(term: str) -> str:
        """Return Base Resume lines that mention a term, to check a claim is supported."""
        hits = [ln for ln in base_resume.splitlines() if term.lower() in ln.lower()]
        return "\n".join(hits) or "NO MATCH: the Base Resume does not support this."

    return create_agent(
        model=agent_model,
        tools=[review_draft, search_base_resume],
        system_prompt=(
            "You tailor a Base Resume to Job Details. Invent nothing. "
            "Call review_draft before you finish, and stop once it approves."
        ),
        response_format=FinalDraft,  # lands in result["structured_response"]
        middleware=[ModelCallLimitMiddleware(run_limit=8, exit_behavior="end")],
    )

# result = build_agent(...).invoke({"messages": [HumanMessage("Tailor it.")]})
# result["structured_response"]  -> FinalDraft, or None if the cap was hit
```

**Trade-offs.**

- Pro: Genuinely agentic. The model can check claims, ask for review twice, or skip a tool it does not need.
- Pro: Adding a capability means adding a tool, not rewiring a graph.
- Con: **Nothing guarantees a review.** "Call review_draft before you finish" is a request in a prompt, not a rule. The agent can submit an unreviewed draft. You can enforce the rule only by adding code back, for example a middleware check or validation in the final tool. That code is Pattern A creeping back in.
- Con: More model calls per draft (one per tool decision, plus the reviewer's), so it costs more and runs slower. Anthropic: agentic systems "often trade latency and cost for better task performance".
- Con: It is harder to read what happened. The path lives in a `messages` list, not in named nodes.
- Con: A new dependency (`langchain`), and a larger API surface (middleware, response strategies) to learn.

**Testing offline.** Script the agent's turns as tool calls. The final turn is a tool call named after the `response_format` class (`FinalDraft`), because `create_agent` falls back to *tool strategy* for a model with no native structured output, and fakes have none.

```python
def call(name, args, call_id):
    return AIMessage(content="", tool_calls=[{"name": name, "args": args, "id": call_id}])


def test_agent_searches_reviews_and_submits():
    agent_model = FakeToolCallingModel(messages=iter([
        call("search_base_resume", {"term": "python"}, "c1"),
        call("review_draft", {"resume_markdown": "# Draft"}, "c2"),
        call("FinalDraft", {"resume_markdown": "# Draft", "notes": "ok"}, "c3"),
    ]))
    reviewer_model = FakeToolCallingModel(messages=iter([review_call("approve")]))
    result = build_agent(agent_model, reviewer_model, "Python, 5 years").invoke(
        {"messages": [HumanMessage("Tailor it.")]}
    )
    assert isinstance(result["structured_response"], FinalDraft)
    names = [m.name for m in result["messages"] if isinstance(m, ToolMessage)]
    assert names[:2] == ["search_base_resume", "review_draft"]


def test_model_call_cap_ends_the_run():
    agent_model = FakeToolCallingModel(messages=iter(
        [call("search_base_resume", {"term": "x"}, f"c{i}") for i in range(20)]
    ))
    result = build_agent(agent_model, FakeToolCallingModel(messages=iter([])), "Python").invoke(
        {"messages": [HumanMessage("Tailor it.")]}
    )
    assert result["structured_response"] is None
    assert "Model call limits exceeded" in result["messages"][-1].text
```

### Pattern C: a supervisor with sub-agents

**What it is.** A *supervisor* agent whose tools are other agents: a tailor sub-agent and a reviewer sub-agent. The supervisor decides who works next. This is close to Anthropic's *orchestrator–workers*, where "a central LLM dynamically breaks down tasks, delegates them to worker LLMs, and synthesizes their results". LangChain's *Multi-agent* docs call it the **subagents** pattern ("a main agent calls subagents as tools"). The same docs list *handoffs*, *router* and *custom workflow* as alternatives.

**Concepts used:** everything in Pattern B, plus sub-agents wrapped as tools. Optionally, compiled subgraphs added as nodes.

```python
tailor_agent = create_agent(model=tailor_model, tools=[search_base_resume],
                            system_prompt="You write Resume Drafts.")
reviewer_agent = create_agent(model=reviewer_model, tools=[],
                              system_prompt="You review Resume Drafts.")


@tool
def write_draft(instructions: str) -> str:
    """Ask the tailor sub-agent for a Resume Draft."""
    out = tailor_agent.invoke({"messages": [HumanMessage(instructions)]})
    return out["messages"][-1].text


@tool
def review_draft(resume_markdown: str) -> str:
    """Ask the reviewer sub-agent to critique a Resume Draft."""
    out = reviewer_agent.invoke({"messages": [HumanMessage(resume_markdown)]})
    return out["messages"][-1].text


supervisor = create_agent(
    model=supervisor_model,
    tools=[write_draft, review_draft],
    system_prompt="Coordinate the tailor and the reviewer until the draft is approved.",
    middleware=[ModelCallLimitMiddleware(run_limit=10)],
)
```

**Trade-offs.**

- Pro: Each sub-agent gets a clean context window. LangChain: "Subagents are stateless by design", and only the final result flows back to the supervisor.
- Pro: The pieces can be developed and prompted independently.
- Con: The most model calls of any pattern: supervisor turns on top of each sub-agent's turns. LangChain's own example counts one extra call even for a one-shot request.
- Con: Three prompts to keep consistent, three places for a run to go wrong, and the same "review is optional" problem as B, one level up.
- Con: More than Hem needs. LangChain's docs say "not every complex task requires this approach" and "a single agent with the right (sometimes dynamic) tools and prompt can often achieve similar results". Multi-agent pays off for context management, team boundaries and parallel work. Hem produces one artifact, from inputs small enough to fit in one context window.

**Testing offline.** Give each of the three agents its own scripted fake, then assert on the supervisor's `ToolMessage`s.

```python
def test_supervisor_delegates_to_subagents():
    # tailor_agent / reviewer_agent built with FakeToolCallingModel(messages=iter(["# Draft v1"]))
    # and FakeToolCallingModel(messages=iter(["approve: looks good"])) respectively
    supervisor_model = FakeToolCallingModel(messages=iter([
        call("write_draft", {"instructions": "tailor"}, "s1"),
        call("review_draft", {"resume_markdown": "# Draft v1"}, "s2"),
        "Done: approved draft v1.",
    ]))
    result = supervisor.invoke({"messages": [HumanMessage("Go")]})
    outs = [m.text for m in result["messages"] if isinstance(m, ToolMessage)]
    assert outs == ["# Draft v1", "approve: looks good"]
```

### Pattern D: hybrid, with an agentic tailor inside a fixed review loop

**What it is.** Pattern A's outer graph, unchanged, except that the `tailor` node runs a small `create_agent` agent instead of one model call. The *graph* owns the guarantees: every draft is reviewed, and the loop stops at the cap. The *agent* owns the craft: which Base Resume lines to check and how to rework a section. LangChain's *Multi-agent* page lists this as the **custom workflow** pattern ("mixing deterministic logic with agentic steps"). Anthropic's article makes the same point: the building blocks "can be combined".

**Concepts used:** everything in A, plus a tool-calling agent invoked inside a node (the "call a subgraph from inside a node function" style from LangGraph's *Subgraphs* docs).

```python
class DraftOut(BaseModel):
    resume_markdown: str


async def tailor(state: TailorState) -> dict:
    @tool
    def search_base_resume(term: str) -> str:
        """Return Base Resume lines mentioning a term."""
        lines = state["base_resume"].splitlines()
        return "\n".join(ln for ln in lines if term.lower() in ln.lower()) or "NO MATCH"

    agent = create_agent(
        model=tailor_model,
        tools=[search_base_resume],
        system_prompt="Tailor the resume. Check every claim with search_base_resume.",
        response_format=DraftOut,
        middleware=[ModelCallLimitMiddleware(run_limit=6)],
    )
    review = state.get("review")
    critique = "\n- ".join(review.critique) if review else "(first draft)"
    out = await agent.ainvoke({"messages": [HumanMessage(
        f"Job Details:\n{state['job_details']}\n\n"
        f"Current draft:\n{state.get('resume_draft', '(none)')}\n\n"
        f"Reviewer critique:\n- {critique}"
    )]})
    draft = out["structured_response"]
    if draft is None:  # the inner cap was hit before the agent submitted a draft
        raise RuntimeError("tailor agent hit its model-call cap without a draft")
    return {"resume_draft": draft.resume_markdown, "revision": state.get("revision", 0) + 1}

# review, after_review and the graph wiring are exactly Pattern A's.
```

**Trade-offs.**

- Pro: Real agency where it helps, with A's guarantees kept.
- Pro: Two independent caps: rounds in the outer graph, and model calls in the inner agent.
- Pro: The upgrade from A is local. Only the `tailor` node's body changes, and the graph and its tests stay.
- Con: Two layers to understand, plus the `langchain` dependency.
- Con: You must decide what the node does when the inner agent runs out of calls (the sketch raises an error; it could also keep the previous draft).

**Testing offline.** Use the same fakes as A and B together. The tailor fake scripts tool calls, then a `DraftOut` call. The reviewer fake scripts `Review` calls.

```python
async def test_hybrid_two_rounds():
    tailor = FakeToolCallingModel(messages=iter([
        call("search_base_resume", {"term": "python"}, "a1"),
        call("DraftOut", {"resume_markdown": "draft 1"}, "a2"),
        call("DraftOut", {"resume_markdown": "draft 2"}, "a3"),
    ]))
    reviewer = FakeToolCallingModel(messages=iter(
        [review_call("revise", "Lead with Python"), review_call("approve")]
    ))
    result = await build_graph(tailor, reviewer).ainvoke(
        {"base_resume": "Python 5y", "job_details": "{}"}
    )
    assert result["resume_draft"] == "draft 2"
    assert result["review_rounds"] == 2
```

### Side by side

| | A: workflow loop | D: hybrid | B: single agent | C: supervisor |
|---|---|---|---|---|
| Who picks the next step | Your code (reviewer's verdict picks loop or stop) | Your code outside, the model inside the tailor step | The model | The supervisor model |
| Review guaranteed every round | Yes | Yes | No (prompted) | No (prompted) |
| Hard stop | Round counter | Round counter + `run_limit` | `run_limit` | `run_limit` on each agent |
| Model calls per round | 2 | 2 + tool turns | 1 per tool decision + reviewer | Supervisor turns + each sub-agent's |
| New dependency | None | `langchain` | `langchain` | `langchain` |
| Test effort | Low: pure nodes and router | Medium | Medium: script whole trajectories | High: three scripted fakes |
| Debuggability | Named nodes in a trace | Named outer nodes + one message list | One message list | Nested message lists |
| Change from today's `graph.py` | Swap `human_review` for `review_resume` | A + rewrite one node body | Rewrite | Rewrite |

---

## Part 3: Capping the loop

Without a cap, a picky reviewer and an eager tailor can ping-pong forever and burn tokens. There are three layers. Use the first one, and keep the third as a backstop.

### 1. A loop counter in state (the primary cap)

Keep `review_rounds` in state. Have the `review` node increment it, and have the router check it. When the cap is hit, route to a normal `finish` node that records *why* the run stopped (`stop_reason = "out_of_rounds"`). This is Anthropic's advice in code form: "it's also common to include stopping conditions (such as a maximum number of iterations) to maintain control".

Why a counter and not just `recursion_limit`? The counter is counted in *your* units (review rounds, not super-steps), it ends the run *normally* (you get the final state and the best draft so far), and it can be unit-tested as a pure function. Hem already has a counter, `revision`. You could cap on it instead of adding `review_rounds`, but a separate key keeps "how many drafts" and "how many reviews" from drifting apart if the flow changes.

### 2. `RemainingSteps` (optional, proactive)

`from langgraph.managed import RemainingSteps` gives a state key that LangGraph fills with `recursion_limit − current step`. A router can check it (`if state["remaining_steps"] < 3: return "finish"`) to end the run gracefully *before* the recursion limit errors out. `create_react_agent` uses exactly this: it stops with "Sorry, need more steps to process this request." when `remaining_steps < 2`. For Hem, the round counter makes this redundant. It matters only if you have no counter of your own.

### 3. `recursion_limit` (the backstop)

- **Default in langgraph 1.2.16: 10,007 super-steps** (`DEFAULT_RECURSION_LIMIT` in `langgraph/_internal/_config.py`, overridable with the env var `LANGGRAPH_DEFAULT_RECURSION_LIMIT`). The *Graph API* docs agree: "Starting in version 1.1.4, the default is 10,007 super-steps". Many blog posts and older docs still say **25**, which was the old default. At 10,007, the default no longer protects you in practice. Set it yourself.
- **Set it** as a top-level config key, not inside `configurable`: `graph.invoke(state, {"recursion_limit": 20})`.
- **When it is hit**, LangGraph raises `langgraph.errors.GraphRecursionError` ("Recursion limit of N reached without hitting a stop condition…"). The run is aborted, and `invoke` returns **nothing**. Without a checkpointer, the last draft is gone. With one, you can still read the last saved state with `get_state`.
- **Sizing it for Pattern A:** each round is two super-steps (`tailor`, `review`), plus one for `finish`. With `MAX_REVIEW_ROUNDS = 3`, the worst case is 7 node runs. In the prototype, any `recursion_limit` of 7 or less raised `GraphRecursionError`, and 8 was the smallest that let the round counter end the run. So use about `2 * MAX_REVIEW_ROUNDS + 4` (10 here). That lets the counter always win and still catches a wiring bug. Measure it with a test rather than trusting the arithmetic.
- `create_agent` compiles its graph with `recursion_limit` 9,999 baked in (`langchain/agents/factory.py`), so for Patterns B, C and D, cap with middleware instead.

### For `create_agent`: call-limit middleware

From `langchain.agents.middleware`:

- `ModelCallLimitMiddleware(run_limit=N, exit_behavior="end")` caps model calls in one `invoke`. `"end"` (the default) stops cleanly. Verified behaviour: the last message becomes `AIMessage("Model call limits exceeded: run limit (8/8)")`, and `result["structured_response"]` is `None`. `"error"` raises instead.
- `ToolCallLimitMiddleware(run_limit=N)` (optionally with `tool_name=...`) caps tool calls. Its default `exit_behavior="continue"` blocks the extra calls with an error message and lets the model carry on. `"error"` raises `ToolCallLimitExceededError`, and `"end"` stops (only valid when limiting a single tool).
- `thread_limit=` on either middleware counts across runs on the same `thread_id`, and needs a checkpointer. A one-shot Hem run needs only `run_limit`.

**Design rule for Hem:** when any cap is hit, finish with the best draft you have and a `stop_reason`. Never lose the draft and never loop silently.

---

## Part 4: Structured output for the reviewer's verdict

**The idea.** You want the reviewer to answer with data you can branch on (`verdict == "approve"`), not with prose you would have to parse. `with_structured_output(Review)` turns the pydantic class into a schema, makes the model fill it in, and hands you back a validated `Review` instance. Hem already does this for `TailorOutput` and `JobDetails`.

```python
reviewer = get_model().with_structured_output(Review)   # Runnable → Review
verdict = await reviewer.ainvoke([SystemMessage(...), HumanMessage(draft)])
verdict.verdict      # "approve" | "revise"
verdict.critique     # list[str]
```

**How `ChatAnthropic` does it** (langchain-anthropic 1.7.6, `with_structured_output` docstring and source):

- `method="function_calling"` (the default) turns the schema into a tool and *forces* the model to call it. The tool's name is the class name (`Review`). That is why the fakes in Part 5 script a tool call named `"Review"`.
- `method="json_schema"` uses Claude's native structured-outputs feature instead.
- **Gotcha:** "When `thinking` is enabled, or on models that don't support forced tool use (Claude Opus 5.5, Claude Fable 5.1, Claude Sonnet 5.5), the tool call isn't forced, and a missing tool call raises `OutputParserException`." Hem uses `claude-haiku-4-5-20251001` today, which supports forced tool use. If you upgrade the reviewer model or switch thinking on, pass `method="json_schema"`.
- `include_raw=True` returns `{"raw": AIMessage, "parsed": Review | None, "parsing_error": Exception | None}` instead of raising. This is useful if you would rather treat a malformed review as "revise" than crash.

**Schema tips for a verdict.**

- Use `Literal["approve", "revise"]` (or an `Enum`) for the decision, not a `bool` and not free text. The router then has exactly two cases, and pyright can check them.
- Give each field a `Field(description=...)`. The descriptions are sent to the model as part of the tool schema.
- Make the critique a `list[str]` of actionable items, so the tailor prompt can render them as bullets.
- Consider adding `unsupported_claims: list[str]` so the reviewer explicitly checks Tailoring's "nothing is invented" rule.

**For `create_agent` (Patterns B to D)**, structured *final* answers use `response_format=Schema` and land in `result["structured_response"]`. LangChain picks `ProviderStrategy` (native structured output) when the model supports it, and `ToolStrategy` otherwise. `ToolStrategy(handle_errors=True)`, the default, feeds validation errors back to the model and retries (*Structured output* docs). With fakes, `ToolStrategy` is chosen, so script a tool call named after the schema class.

---

## Part 5: Testing offline with fake models

**Goal:** run the whole loop in `pytest` with no API key, no network and deterministic results.

### The fakes in `langchain_core` 1.7.0

All live in `langchain_core.language_models.fake_chat_models`.

| Class | What it returns | Use it for |
|---|---|---|
| `GenericFakeChatModel(messages=iter([...]))` | The next item from an iterator, either a `str` or a full `AIMessage` (which can carry `tool_calls`). | Most tests. This is the one LangChain's *Unit testing* docs lead with. |
| `FakeListChatModel(responses=[...])` | The next string, cycling back to the start when it runs out. | Text-only nodes, such as Pattern A's tailor. |
| `FakeMessagesListChatModel(responses=[...])` | The next `BaseMessage`, cycling. | Like Generic, but cycles instead of running out. |

**The catch.** `BaseChatModel.bind_tools` raises `NotImplementedError`, and none of these fakes override it. `with_structured_output` and `create_agent` both call `bind_tools`, so a plain fake fails before your test starts. (Verified: `GenericFakeChatModel(...).with_structured_output(Review)` raises `NotImplementedError`.) LangChain's *Unit testing* docs give the fix: subclass the fake and return `self`.

```python
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage


class FakeToolCallingModel(GenericFakeChatModel):
    """GenericFakeChatModel that tolerates bind_tools / with_structured_output."""

    def bind_tools(self, tools, *, tool_choice=None, **kwargs):
        return self


def review_call(verdict: str, *critique: str, call_id: str = "r") -> AIMessage:
    """Script one reviewer turn as the tool call with_structured_output parses."""
    return AIMessage(content="", tool_calls=[{
        "name": "Review",  # must equal the schema class name
        "args": {"verdict": verdict, "critique": list(critique)},
        "id": call_id,
    }])
```

`with_structured_output(Review)` on this fake parses the scripted tool call into a real `Review` instance, so your node code runs unchanged.

### What to test, per pattern

- **Router (all patterns with a graph):** call `after_review(state)` directly with hand-built states. No model is needed. This is how `tests/test_routing.py` works today.
- **Nodes (A, D):** call the node function directly with a fake through its `model` seam. Hem's existing `AsyncMock` approach (`mock_model.ainvoke.return_value = Review(...)`) is also fine, and is what `CODING_STANDARDS.md` prescribes for node tests. Use fakes for whole-graph tests, where you want real LangChain plumbing.
- **Whole graph (A, D):** one test per way the run can end: approved on round 1, approved after revising, out of rounds. Optionally add one test that a tiny `recursion_limit` raises `GraphRecursionError` (which proves the backstop is wired).
- **Agents (B, C, D):** script the trajectory (tool call, tool call, final answer), then assert on `structured_response` and on the sequence of `ToolMessage.name`s. Add one test that the call cap ends the run (`structured_response is None`).

### Practical tips

- **Build the fake inside each test, or in a function-scoped fixture.** `GenericFakeChatModel` consumes an iterator, so a shared one is empty in the second test (*Unit testing* docs).
- Script exactly as many turns as you expect. When a `GenericFakeChatModel` runs out of messages, it raises a bare `RuntimeError` with an empty message (verified), so an unexpected extra model call fails the test. The error message gives no hint of the cause, so if you see an empty `RuntimeError`, suspect the script first.
- LangGraph's *Test* docs suggest building the graph in a factory (like `build_graph(...)` above), so that each test gets a fresh graph. To run one node through the compiled graph, use `compiled.nodes["review"].invoke(state)`. To test a slice of the graph, use `update_state(..., as_node=...)` together with `interrupt_after=...`, which needs a checkpointer.
- Anthropic recommends "extensive testing in sandboxed environments". Fake-model tests check the *plumbing*. They say nothing about whether the reviewer's judgement is any good. Prompt quality needs a separate, slower eval against real models (out of scope here).

---

## Part 6: Do you need a checkpointer?

**Short answer: no, not for a run with no human in the loop.** A graph compiled with plain `builder.compile()` runs start to finish with `invoke` / `ainvoke`, and returns the final state.

**What a checkpointer is for** (LangGraph *Persistence* docs): "conversation continuity, human-in-the-loop workflows, time travel, and fault tolerance". Mapped to Hem:

| Need | Without a checkpointer | With `InMemorySaver` / `SqliteSaver` |
|---|---|---|
| Run the loop to completion | Yes | Yes |
| `interrupt()` (today's Human Review) | No: the run stops and returns `__interrupt__`, but cannot be resumed | Yes: resume with the same `thread_id` |
| `get_state` / `get_state_history` | No: raises `ValueError: No checkpointer set` (verified) | Yes: inspect every super-step, which is handy for debugging a run that took five rounds |
| Keep the last draft if `GraphRecursionError` or a crash aborts the run | No: lost | Yes: read it back from the last checkpoint |
| Resume a crashed run mid-loop (skip finished LLM calls) | No | Yes, with a *durable* saver (SQLite/Postgres). `InMemorySaver` dies with the process. |
| `ModelCallLimitMiddleware(thread_limit=...)` | No | Yes |

**Two Hem-specific findings:**

1. **`langgraph dev` / LangGraph Studio rejects a custom checkpointer.** `langgraph.json` points the Agent Server at the module-level `graph` in `src/hem/graph.py`. In local dev, the server raises "Heads up! Your graph … includes a custom checkpointer … persistence is handled automatically by the platform" if that graph was compiled with one (`langgraph_api/graph.py`). So keep `graph = builder.compile()` checkpointer-free. If the CLI wants persistence, have it compile its own copy: `builder.compile(checkpointer=InMemorySaver())`.
2. **Today's CLI relies on a checkpointer it does not have.** `src/hem/cli.py` calls `graph.aget_state(...)` and resumes interrupts, but `graph` is compiled without a checkpointer. On these versions, that raises `ValueError: No checkpointer set` once the first `interrupt()` fires. The autonomous pivot removes the interrupt, and the bug with it. It is worth knowing if anyone runs the current CLI before then.

**Recommendation:** ship the MVP without a checkpointer. Add `InMemorySaver` in the CLI only if you want `get_state_history` for debugging, and a durable saver only if runs become long enough that losing one hurts.

---

## Part 7: Recommendation for Hem's MVP

**Build Pattern A (the evaluator–optimizer `StateGraph`) now, shaped so its tailor node can become Pattern D's agent later.**

Why:

- **It keeps the invariants that matter.** Every Resume Draft is reviewed, and every run stops. In B and C, both depend on the model following a prompt.
- **It is the smallest change.** Today's graph already has `tailor_resume`, `revise_resume`, a conditional edge and a `revision` counter. Replace `human_review` with a `review_resume` node (structured `Review`), extend `after_review` to read the verdict and a round cap, and add a `finish` node that writes the draft to disk and records `stop_reason`. ADR-0001's reason for keeping a separate review node, that `interrupt()` re-runs the node it is in when the run resumes, no longer applies once there is no interrupt. The split still pays off as clean separation between generating and judging.
- **It matches the primary-source advice.** Anthropic recommends "the simplest solution possible", and names evaluator–optimizer as the fit "when we have clear evaluation criteria, and when iterative refinement provides measurable value". A job posting plus a "nothing invented" rule is exactly that.
- **It is the cheapest to learn and test** for someone new to LangGraph. It uses no new dependency, and pure nodes plus a pure router fit the existing test conventions.

**Is it "genuinely agentic"?** Partly. The reviewer's judgement, not a fixed count, decides whether the loop continues, but the steps themselves are scripted. The honest path to an agent is **Pattern D**: when the tailor needs to *act* rather than just write, give it tools and run it through `create_agent` inside the `tailor` node. The outer graph and its tests stay as they are. The first tool worth adding is `search_base_resume` / `verify_claim`, which lets the tailor check each claim against the Base Resume. Glossary: Tailoring is "rephrasing, reordering, and emphasising only what the Base Resume supports. Nothing is invented."

**Not recommended for the MVP:** B, because review becomes optional and the run becomes harder to test and debug. C, because it means three agents for one document, and LangChain's own docs say a single agent "can often achieve similar results".

---

## Open questions and limits of this research

- **The `langchain` package is not in `uv.lock`.** Patterns B to D were verified against `langchain` 1.4.7 in a scratch venv. Adding it to Hem would pull in whatever version resolves at the time.
- **Serialising pydantic objects in durable checkpoints** (for example, `Review` stored in state with `SqliteSaver`) was verified only with `InMemorySaver`. If you add a durable saver, consider storing `review.model_dump()` instead of the object, or test the round trip first.
- **Reviewer quality** (does the critique actually improve drafts, and does the loop converge in under three rounds?) cannot be answered by offline tests. It needs an eval with real models.
- Anthropic's article notes that it predates newer tooling and points to Anthropic's Managed Agents docs for its current approach. That approach was not evaluated here, because Hem is committed to LangGraph.

---

## Sources

**Primary documentation**

- Anthropic, *Building effective agents*: <https://www.anthropic.com/engineering/building-effective-agents> (workflow/agent definitions, evaluator–optimizer, orchestrator–workers, stopping conditions, sandboxed testing, "simplest solution possible")
- LangGraph, *Workflows and agents*: <https://docs.langchain.com/oss/python/langgraph/workflows-agents> (evaluator–optimizer example with `with_structured_output(Feedback)`, the hand-rolled agent loop)
- LangGraph, *Graph API*: <https://docs.langchain.com/oss/python/langgraph/graph-api> (state, reducers, nodes, edges, super-steps, `recursion_limit` default 10,007 since 1.1.4, `Command`)
- LangGraph, *GRAPH_RECURSION_LIMIT*: <https://docs.langchain.com/oss/python/langgraph/GRAPH_RECURSION_LIMIT>
- LangGraph, *Persistence*: <https://docs.langchain.com/oss/python/langgraph/persistence>
- LangGraph, *Interrupts*: <https://docs.langchain.com/oss/python/langgraph/interrupts> (a checkpointer is a prerequisite for `interrupt()`)
- LangGraph, *Subgraphs*: <https://docs.langchain.com/oss/python/langgraph/use-subgraphs>
- LangGraph, *Test*: <https://docs.langchain.com/oss/python/langgraph/test>
- LangChain, *Agents*: <https://docs.langchain.com/oss/python/langchain/agents> (`create_agent`)
- LangChain, *Structured output*: <https://docs.langchain.com/oss/python/langchain/structured-output> (`ToolStrategy`, `ProviderStrategy`, `handle_errors`)
- LangChain, *Built-in middleware*: <https://docs.langchain.com/oss/python/langchain/middleware/built-in> (`ModelCallLimitMiddleware`, `ToolCallLimitMiddleware`)
- LangChain, *Multi-agent*: <https://docs.langchain.com/oss/python/langchain/multi-agent>, and *Subagents*: <https://docs.langchain.com/oss/python/langchain/multi-agent/subagents>
- LangChain, *Unit testing*: <https://docs.langchain.com/oss/python/langchain/test/unit-testing> (fake models, the `bind_tools` subclass, function-scoped fixtures)

**Installed source (exact locked versions)**

- `langgraph/_internal/_config.py`: `DEFAULT_RECURSION_LIMIT = int(getenv("LANGGRAPH_DEFAULT_RECURSION_LIMIT", "10007"))`
- `langgraph/pregel/main.py`: raises `GraphRecursionError` when the loop status is `out_of_steps`
- `langgraph/managed/is_last_step.py`: `RemainingSteps` = `stop − step`
- `langgraph/prebuilt/chat_agent_executor.py` (prebuilt 1.1.1): `create_react_agent` is `@deprecated` in favour of `langchain.agents.create_agent`, and uses `remaining_steps < 2` to stop
- `langchain_core/language_models/chat_models.py`: base `bind_tools` raises `NotImplementedError`
- `langchain_core/language_models/fake_chat_models.py`: `GenericFakeChatModel`, `FakeListChatModel`, `FakeMessagesListChatModel`
- `langchain_anthropic/chat_models.py`: `with_structured_output(method="function_calling" | "json_schema")` and the forced-tool-use caveat
- `langgraph_api/graph.py`: local dev rejects a graph compiled with a custom checkpointer or store
- `langchain/agents/factory.py` (langchain 1.4.7): `create_agent` compiles with `recursion_limit` 9,999

**Hem code read:** `src/hem/graph.py`, `src/hem/state.py`, `src/hem/cli.py`, `src/hem/nodes/tailor_resume.py`, `src/hem/nodes/human_review.py`, `tests/test_routing.py`, `tests/test_tailor_resume.py`, `docs/adr/0001-split-generator-and-review-nodes.md`, `CODING_STANDARDS.md`, `GLOSSARY.md`.
