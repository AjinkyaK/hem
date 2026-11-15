# Designing an AI reviewer that judges a Resume Draft reliably

Date: 2026-11-15

Ticket: #30, a child of the map #27.

## Question

What does good practice say about an LLM reviewer (LLM-as-judge) that checks a Resume
Draft against the Base Resume and Job Details? It covers six areas: grounding and fabrication
detection, rubrics and thresholds, self-agreement bias, critiques a reviser can act on,
when to stop the loop, and deterministic checks that run alongside the judge.

The setting is Hem going autonomous. A tailoring agent writes a Resume Draft, an AI
reviewer critiques it, and the loop runs until the draft passes or a cap is hit, with no
human in the loop. The models are Anthropic Claude via `langchain-anthropic` (1.7.6 and
`anthropic` 1.17.0 are locked in `uv.lock`).

Each claim below cites its source. A paragraph marked **Hem inference** is a conclusion
drawn from the sources. No source states it directly.

## Answer in brief

1. **Check grounding claim by claim, and make the reviewer quote its evidence.** FActScore
   splits text into atomic facts and checks each one against a source instead of
   judging the whole text, and its automated estimator errs less than 2% of the time.
   Anthropic's hallucination guide says to find a direct supporting quote for each claim
   and retract any claim that has none. In Hem, code can then check that each quote
   really appears in the Base Resume.
2. **Use binary checklist items with one isolated judge per dimension, not a single 1–10
   score.** Anthropic says to grade each dimension with its own LLM-as-judge and to give
   the judge an "Unknown" way out. LLM numeric ratings are skewed, show anchoring, and
   shift with trivial prompt changes. Generated yes/no checklists raised exact agreement
   with humans from 46.4% to 52.2%.
3. **Treat fabrication as a hard gate.** Any unsupported claim fails the draft,
   whatever its other quality. Fit to the Job Details is graded separately, as a
   checklist with a threshold.
4. **Self-preference bias is real, so the reviewer should not be the writer's context.**
   LLMs rate their own outputs higher. The bias rises with how well the model recognises
   its own text, and it appears to come from preferring familiar, low-perplexity text.
   Use a different Claude model from the tailor, a fresh context and a different prompt. A
   different temperature is not an option: Claude 4.7 and later reject non-default
   sampling parameters, and API version `2026-10-21` removes them.
5. **Critiques must be specific and located.** Self-Refine's specific feedback beat
   generic feedback, which in turn beat no feedback. LLMs fix mistakes reliably once told
   where they are, but they find mistakes poorly. So every issue should carry a location,
   the evidence, a severity and a suggested fix.
6. **Self-correction only works with reliable feedback, so keep the best draft, not the
   last one.** Intrinsic self-correction often fails and can make output worse. It works
   when the feedback is reliable and external. Code-checked quotes and deterministic
   checks are the reliable part of Hem's feedback.
7. **Stop early and cap low.** Self-Refine stops on a stop signal or a fixed step count,
   capped at 4 iterations, and shows diminishing returns. Anthropic recommends stopping
   conditions such as a maximum number of iterations. Also stop when the draft repeats
   or the issue count stops falling.
8. **Run deterministic checks first.** Anthropic says to choose deterministic graders
   where possible: they are fast, cheap, objective and reproducible. Use code for
   structure, length, unseen numbers and names, and keyword coverage, and send only
   drafts that pass to the LLM judge.

## 1. Grounding: detecting fabrication

### What the sources say

- **Decompose, then verify each piece.** FActScore "breaks a generation into a series of
  atomic facts" and "computes the percentage of atomic facts supported by a reliable
  knowledge source", instead of giving one binary judgement on the whole text. Its
  automated estimator, which combines retrieval with a strong LM, has "less than a 2%
  error rate" ([Min et al. 2023, FActScore](https://arxiv.org/abs/2305.14251)).
- **Quote first, then judge.** Anthropic recommends extracting "word-for-word quotes
  first before performing its task" so that the answer is grounded in the actual text
  ([Reduce hallucinations](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations)).
- **Verify each claim with a citation, and retract it if none is found.** "Have Claude
  verify each claim by finding a supporting quote after it generates a response. If it
  can't find a quote, it must retract the claim." The guide's example tells the model to
  review "each claim" in a draft, find "a direct quote from the documents that supports
  it", and remove any claim it cannot support (same page).
- **Restrict knowledge to the documents.** "Explicitly instruct Claude to only use
  information from provided documents and not its general knowledge" (same page).
- **Allow "I don't know".** For the judge: "give the LLM a way out", for example by
  telling it to "return 'Unknown' when it doesn't have enough information"
  ([Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)).
- **A reference answer makes the judge much more reliable.** On math questions in MT-Bench,
  a reference-guided judge cut the failure rate "from 70% to 15%". A chain-of-thought
  judge reached only 30%, because "in many cases LLM makes exactly the same mistake as the
  given answers" ([Zheng et al. 2023](https://arxiv.org/abs/2306.05685),
  Table 4).
- **The Citations API guarantees valid pointers.** Citations "are guaranteed to contain
  valid pointers to the provided documents", and `cited_text` does not count toward
  output tokens. Plain-text documents are chunked into sentences, and custom-content
  documents let the caller set the granularity, for example one block per resume
  bullet. However, "Citations cannot be used together with structured outputs": the API
  returns a 400 error. The API also doesn't guarantee that each field gets at least one
  citation ([Citations](https://platform.claude.com/docs/en/build-with-claude/citations)).

### For Hem

**Hem inference.** The Base Resume is the reference answer, so grounding is a
reference-guided check, which is the easy case for a judge. The reviewer should:

1. Split the Resume Draft into atomic claims. One bullet often holds several: a role, an
   action, a tool and a metric.
2. For each claim, return a verdict (`supported`, `unsupported` or `unknown`) and the
   verbatim Base Resume span that supports it.
3. Have **code** check each quoted span against the Base Resume, as a substring match
   after normalising whitespace and case. A claim whose quote is not found counts as
   unsupported, whatever the verdict says. This turns the model's grounding claim into
   something that can be verified, which is the "reliable external feedback" that
   self-correction needs (see section 6).

There are two ways to get the spans:

- **Structured output with a `quote` field per claim, plus a code-side substring check.**
  This fits Hem's existing `with_structured_output` style.
- **The Citations API, with the Base Resume as a custom-content document of one block per
  bullet.** It gives guaranteed-valid pointers, but it can't be combined with structured
  outputs, so the verdicts would have to be parsed from text.

The first is simpler and keeps everything in one schema. The substring check gives most
of the Citations API's guarantee.

Rephrasing is allowed, so "supported" must mean "entailed by the quoted span", not
"identical to it". The rubric should list what counts as invention in a resume, with
examples:

- a number, percentage, money figure, team size or date not in the Base Resume
- a tool, skill, certification, employer, title or degree not in the Base Resume
- a scope inflated beyond what the Base Resume says, such as "led" for "contributed to"
  or "architected" for "implemented"
- a Job Details keyword attached to a role where the Base Resume does not support it

A whole-document "is this faithful? yes/no" check is the wrong grain. It gives the reviser
nothing to locate, and one fabricated metric is easy to miss in a whole-page judgement.

## 2. Rubrics: checklists, numeric scores and thresholds

### What the sources say

- **Prefer clear, specific rubrics.** "Have detailed, clear rubrics". "Be empirical or
  specific: for example, instruct the LLM to output only 'correct' or 'incorrect', or to
  judge from a scale of 1–5. Purely qualitative evaluations are hard to assess quickly
  and at scale." "A given use case, or even a specific success criterion for that use
  case, might require several rubrics" ([Define tests: LLM-based grading](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests)).
- **Grade each dimension separately.** "Create clear, structured rubrics to grade each
  dimension of a task." "Vague rubrics produce inconsistent judgments." "Grade each
  dimension with an isolated LLM-as-judge rather than using one to grade all
  dimensions." "For tasks with multiple components, build in partial credit"
  ([Demystifying evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)).
- **Let the judge reason first.** "Use a grader model with thinking on, so that it reasons
  before it produces an evaluation score. This increases evaluation performance,
  particularly for tasks requiring complex judgment" ([Define tests](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests)).
  Wang et al. likewise ask the evaluator "to generate multiple evaluation evidence before
  assigning ratings" ([Wang et al. 2023](https://arxiv.org/abs/2305.17926)).
- **Numeric scores are poorly calibrated.** LLM evaluators show "skewed and biased
  distributions of ratings", "anchoring effects for multi-attribute judgments", "low
  inter-sample agreement" and "sensitivity to prompt differences that are insignificant
  to human understanding of text quality" ([Stureborg et al. 2024](https://arxiv.org/abs/2405.01724)).
- **Checklists improve agreement.** TICK breaks an instruction into yes/no checklist items.
  It raised exact agreement between LLM and human judgements "from 46.4% to 52.2%"
  compared with direct scoring. Using the same checklist for self-refinement (STICK) gave
  a 7.8-point absolute gain on LiveBench reasoning ([Cook et al. 2024, TICK](https://arxiv.org/abs/2410.03608)).
- **Calibrate against humans.** "LLM-as-judge graders should be closely calibrated with
  human experts." Model-based graders "require calibration with human graders for
  accuracy" ([Demystifying evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)).
  The develop-tests guide's advice is to "test to ensure reliability first, then
  scale".

### For Hem

**Hem inference.** Use two isolated judges, each with binary items:

- **Grounding judge** (section 1). The threshold is zero unsupported claims. This is a
  hard gate, because "Nothing is invented" is the core rule.
- **Fit judge.** Use a checklist derived from Job Details, with items such as:
  - Each must-have requirement the Base Resume supports appears in the draft and
    is emphasised where it fits, for example in the summary or a top bullet.
  - No supported must-have is buried or dropped.
  - The summary targets this role.
  - The most relevant experience comes first.
  - The tone and length suit the role level.

  Tag each item `must` or `should`. A draft passes when every `must` item passes. `should`
  failures become minor issues and do not block.

Do not combine the two into one number. A strong fit score can hide a single fabricated
metric, and a 1–10 score gives the loop no clear stopping point. If a ranking number is
needed, for example to pick the best draft at the cap, compute it in code from the item
verdicts. Don't ask the model for one.

## 3. Self-agreement bias: one model writes and reviews

### What the sources say

- **Self-enhancement exists.** In MT-Bench, "GPT-4 favors itself with a 10% higher win
  rate; Claude-v1 favors itself with a 25% higher win rate". The authors caution that the
  data was limited ([Zheng et al. 2023](https://arxiv.org/abs/2306.05685)).
- **Self-preference tracks self-recognition.** An LLM evaluator "scores its own outputs
  higher than others'" even when humans rate the outputs as equal. Fine-tuning revealed "a
  linear correlation between self-recognition capability and the strength of
  self-preference bias" ([Panickssery et al. 2024](https://arxiv.org/abs/2404.13076)).
- **The mechanism is familiarity.** "LLMs assign significantly higher evaluations to
  outputs with lower perplexity", and "the self-preference bias exists because LLMs
  prefer texts more familiar to them" ([Wataoka et al. 2024](https://arxiv.org/abs/2410.21819)).
  Stureborg et al. also report "familiarity bias - a preference for text with lower
  perplexity" ([2024](https://arxiv.org/abs/2405.01724)).
- **Use a different model.** Anthropic's own grader examples carry the comment
  "Generally best practice to evaluate with a different model from the one used to
  generate the evaluated output" ([Define tests](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests)).
- **Use separate calls for screening.** A guardrail where "one model instance processes
  user queries while another screens them... tends to perform better than having the
  same LLM call handle both" ([Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)).
- **Panels reduce intra-model bias, but only across families.** A Panel of LLM evaluators
  "exhibits less intra-model bias due to its composition of disjoint model families" and
  is "over seven times less expensive" than one large judge ([Verga et al. 2024, PoLL](https://arxiv.org/abs/2404.18796)).
- **Temperature is not a lever on current Claude models.** Claude Opus 4.7 rejects
  non-default `temperature`, `top_p` and `top_k` ([What's new in Claude Opus 4.7](https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-7)).
  In API version `2026-10-21`, "a request that sends `temperature`, `top_p`, or `top_k`
  returns a 400 error, even at the parameter's default value", and "no other setting
  replaces it" ([Migrating to API version 2026-10-21](https://platform.claude.com/docs/en/api/migration-2026-10-21)).
  Hem's locked `anthropic` 1.17.0 still sends `2023-06-01`
  (`anthropic/_constants.py`), so older models such as Claude Haiku 4.5 accept a
  temperature. `langchain-anthropic` 1.7.6 raises a `ValueError` for non-default values on
  Fable 5 and Sonnet 5.5 (`chat_models.py`).

### For Hem

**Hem inference.** Hem is Claude-only, so a cross-family panel isn't available. Instead:

- **Use a different Claude model for the reviewer than for the tailor.** This weakens
  self-recognition and the familiarity effect, though it can't remove them: models in
  one family likely share much of their training data and style. A different tier, such
  as an Opus reviewer for a Sonnet tailor, also gives a stronger judge. Which model takes
  which role is still open on the map.
- **Give the reviewer a fresh context.** It gets only the Base Resume, Job Details, the
  Resume Draft and its rubric. It does not get the tailor's prompt, reasoning or earlier
  critiques. The Applicant's personal career context (being moved out of
  `prompts/tailor_resume.py`) is not evidence. Only the Base Resume is.
- **Give the reviewer a different role prompt.** The reviewer is an auditor who is
  rewarded for finding unsupported claims, not a co-author.
- **Do not rely on temperature.** For variety, use a second prompt framing or a second
  model. For extra recall on grounding, run two independent grounding passes and take
  the union of the flagged claims. This is Anthropic's voting pattern ("running the same
  task multiple times", with vote thresholds to trade false positives against false
  negatives, from [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)).
  Skip this until a calibration set (section 6) shows it's needed.

Self-preference matters most for the subjective fit judgement. It matters least for the
grounding judgement, because grounding is reference-guided and each verdict is checked by
code against a quote.

## 4. Critiques a reviser can act on

### What the sources say

- **Specific feedback beats generic feedback.** Self-Refine asks for feedback that is
  actionable and specific. In its ablation, code-optimisation performance "slightly dips
  from 27.5 (Self-Refine feedback) to 26.0 (generic feedback), and further to 24.8 (no
  feedback)" ([Madaan et al. 2023, Self-Refine](https://arxiv.org/abs/2303.17651),
  section 4; quoted from the [ar5iv HTML](https://ar5iv.labs.arxiv.org/html/2303.17651)).
- **Location is the bottleneck.** "Poor self-correction performance stems from LLMs'
  inability to find logical mistakes". Given the error location, "LLMs' correction
  abilities are robust" ([Tyen et al. 2023](https://arxiv.org/abs/2311.08516)).
- **Feedback should be articulable.** Evaluator–optimizer fits "when we have clear
  evaluation criteria", and when "LLM responses can be demonstrably improved when a
  human articulates their feedback" ([Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)).

### For Hem

**Hem inference.** Every issue the reviewer returns should be a structured record:

| Field | Example |
|---|---|
| `id` | A stable key for the issue, such as `G-exp2-b3-metric`, used to spot repeats |
| `severity` | `blocker` (any grounding failure), `major` (a failed `must` fit item), or `minor` |
| `location` | Section plus the exact draft text, e.g. Experience › Acme › "Cut latency 40%…" |
| `criterion` | Which rubric item failed |
| `evidence` | The Base Resume or Job Details span, or "none found in Base Resume" |
| `fix` | A concrete change, e.g. "Drop '40%': the Base Resume says 'reduced latency' with no figure" |

Send the reviser the blockers first, then the majors, then the minors only if they won't
crowd out the rest. Have the reviser revise the existing draft rather than rewrite it
from scratch, so that passing parts stay put. For a grounding blocker, the fix is
always one of three things: soften the claim to what the evidence supports, attach the
claim to the role the evidence comes from, or remove it.

## 5. When to stop

### What the sources say

- **Stop on a signal or a cap.** Self-Refine's stop condition "either stops at a specified
  timestep t, or extracts a stopping indicator (e.g. a scalar stop score) from the
  feedback". Its experiments run "up to a maximum of 4 iterations", and its Figure 4 shows
  "the diminishing returns in the improvement as the number of iterations increases"
  ([ar5iv HTML](https://ar5iv.labs.arxiv.org/html/2303.17651), sections 2, 3.1 and 4).
- **Agents need stopping conditions.** "It's also common to include stopping conditions
  (such as a maximum number of iterations) to maintain control"
  ([Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)).
- **Later drafts can be worse.** On reasoning tasks, LLMs "struggle to self-correct their
  responses without external feedback, and at times, their performance even degrades
  after self-correction" ([Huang et al. 2023](https://arxiv.org/abs/2310.01798)).

### For Hem

**Hem inference.**

- **Pass:** zero grounding blockers and every `must` fit item passes. Stop at once.
- **Cap:** at most 3 revision rounds after Revision 1, so at most 4 drafts. This matches
  Self-Refine's 4 iterations, and returns diminish after the first couple of rounds. Make
  the cap a setting.
- **Detect a stall or oscillation:**
  - Stop if a draft's normalised hash equals an earlier draft's.
  - Stop if the set of issue `id`s repeats an earlier set (A → B → A).
  - Stop if the weighted issue count fails to fall for two rounds running.
- **Keep every draft.** At the end, return the **best** draft, not the last. Rank by
  (grounding blockers, failed `must` items, `should` failures), lowest first, computed in
  code. Later drafts can be worse, which is why the last one is not the default.
- **When no draft passes:**
  - If the best draft has no grounding blockers and only fit failures, write it out
    marked **not passed**, with the open issues in a review report next to the markdown.
  - If every draft still has a grounding blocker, the run fails. Write the best draft
    and the list of unsupported claims for diagnosis, and exit non-zero. Never present
    a draft with an invented claim as the result.

## 6. Deterministic checks alongside the judge

### What the sources say

- Code-based graders are "Fast, Cheap, Objective, Reproducible, Easy to debug" but
  "Brittle to valid variations" and "Lacking in nuance". Prefer "choosing deterministic
  graders where possible", and use LLM graders "where necessary or for additional
  flexibility" ([Demystifying evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)).
- Code-based grading is the "fastest and most reliable, extremely scalable" method. The
  guide's examples are exact and string match ([Define tests](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests)).
- "Self-correction works well in tasks that can use reliable external feedback". In
  contrast, "no prior work demonstrates successful self-correction with feedback from
  prompted LLMs" except on tasks especially suited to it ([Kamoi et al. 2024, TACL](https://arxiv.org/abs/2406.01297)).

### For Hem

**Hem inference.** Run these in code before the LLM judges. A failure becomes a
located issue in the same schema, and the round skips the paid judge calls:

- **Structure.** The draft parses as markdown and has the Base Resume's core sections
  (contact, experience, education, skills) in a sensible order. It has no leftover
  placeholders or meta-text, such as "Here is your tailored resume".
- **Length.** Words or lines stay within a budget, for example no longer than the Base
  Resume plus a margin, or a one-to-two-page estimate. Bullets stay under a maximum
  length.
- **Preserved facts.** Employer names, titles, date ranges and degrees from the Base
  Resume appear unchanged. Tailoring may reorder and emphasise, but it should not rename
  a job.
- **Unseen tokens, the cheapest fabrication tripwire.** Extract every number,
  percentage, money figure, year and capitalised proper noun or tool name from the draft.
  Flag any that does not appear in the Base Resume as a candidate blocker for the
  grounding judge to confirm. This has a high false-positive rate on rephrasing
  ("five" against "5"), so use it to route claims to the judge, not to fail the draft on
  its own.
- **Keyword coverage.** For each Job Details keyword, check three things: is it in the
  Base Resume, and is it in the draft? A keyword in both scores as coverage. A keyword in
  the Base Resume but missing from the draft becomes a fit issue: an emphasis the draft
  missed. A keyword in the draft but not the Base Resume becomes a grounding red flag.
  Report coverage only over **supported** keywords, so the loop never pushes the
  tailor to add unsupported ones.

These checks are the reliable external feedback Kamoi et al. find necessary. They also
make the cheap failures (length, structure) cost no LLM calls.

## Recommended reviewer for Hem's MVP

**Hem inference**, drawn from all of the above:

1. **A deterministic check node** in code, as described in section 6. It fails fast with
   located issues.
2. **A grounding judge**, an LLM call with a different Claude model from the tailor, in a
   fresh context. It decomposes the draft into claims and returns
   `{claim, location, verdict, quote}` per claim. Code then verifies every quote against
   the Base Resume. Zero unsupported claims is a hard gate.
3. **A fit judge**, an LLM call with thinking on. It works through a binary checklist
   derived from Job Details, with `must` and `should` items and an "unknown" option,
   and returns located, prioritised issues with fixes.
4. **A loop** that stops on pass, after at most 3 revision rounds, or on a repeat or
   stall. It returns the best draft, not the last, and fails loudly when no draft is
   grounded.
5. **A small calibration set before trusting it.** Take a handful of real Base Resume and
   Job Posting pairs. Seed drafts with known fabrications (an invented metric, an added
   tool, an inflated title or scope) and with clean rephrasings. Measure the grounding
   judge's recall on the fabrications and its false-positive rate on the rephrasings.
   This is the human calibration Anthropic asks for. It is also the start of the "evals
   or regression checks" item that the map lists under production.

Why this design:

- Fabrication is the one failure Hem must not ship, so it gets the strongest tools:
  claim-level checks, a reference, code-verified quotes and a hard gate.
- Fit is subjective, so it gets the bias mitigations: a different model, isolated
  binary items, and reasoning before verdicts.
- The loop's stopping rules guard against the known failure of self-correction, where
  later drafts get worse.

Splitting the two judges also maps onto LangGraph cleanly: a check node, two judge
nodes or one node with two calls, and a conditional edge back to the reviser. ADR-0001
already splits generator and review nodes.

### Implementation notes (`langchain-anthropic` 1.7.6)

- `with_structured_output` defaults to `method="function_calling"`, which forces
  `tool_choice`. Claude Opus 5.5, Sonnet 5.5 and Fable 5.1 reject forced tool use. The
  library detects these models (`_supports_forced_tool_choice`), drops the forced choice
  and warns, suggesting `method='json_schema'`, and it raises an `OutputParserException`
  if the model then doesn't call the tool. If the reviewer runs on one of these models,
  pass `method="json_schema"` ([What's new in Claude Opus 5.5](https://platform.claude.com/docs/en/models/opus-5-5/whats-new-opus-5-5),
  `langchain_anthropic/chat_models.py`).
- On Claude Opus 5.5, thinking is always on, and `effort` controls its depth (the
  default is `medium`) (same page). For the judges, set the effort explicitly rather
  than relying on the default.
- The Citations API is incompatible with structured outputs (section 1). Choose one per
  call.

## Sources

Anthropic, first-party:

- [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents): evaluator–optimizer, guardrails as separate calls, voting, stopping conditions.
- [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents): grader types, rubrics, an isolated judge per dimension, "Unknown", calibration.
- [Define success criteria and build evaluations: develop tests](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests): grading methods, tips for LLM-based grading, the "different model" comment.
- [Reduce hallucinations](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations): quotes first, verify with citations, retract unsupported claims.
- [Citations](https://platform.claude.com/docs/en/build-with-claude/citations): valid-pointer guarantee, chunking, incompatibility with structured outputs.
- [Migrating to API version 2026-10-21](https://platform.claude.com/docs/en/api/migration-2026-10-21) and [What's new in Claude Opus 4.7](https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-7): sampling parameters removed.
- [What's new in Claude Opus 5.5](https://platform.claude.com/docs/en/models/opus-5-5/whats-new-opus-5-5): thinking always on, effort default, no forced tool use.

Papers:

- Zheng et al. 2023, [Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena](https://arxiv.org/abs/2306.05685) (NeurIPS 2023): position, verbosity and self-enhancement bias, reference-guided judging.
- Wang et al. 2023, [Large Language Models are not Fair Evaluators](https://arxiv.org/abs/2305.17926): position bias, evidence before rating.
- Panickssery et al. 2024, [LLM Evaluators Recognize and Favor Their Own Generations](https://arxiv.org/abs/2404.13076): self-preference and self-recognition.
- Wataoka et al. 2024, [Self-Preference Bias in LLM-as-a-Judge](https://arxiv.org/abs/2410.21819): the perplexity and familiarity mechanism.
- Stureborg et al. 2024, [Large Language Models are Inconsistent and Biased Evaluators](https://arxiv.org/abs/2405.01724): score skew, anchoring, prompt sensitivity.
- Verga et al. 2024, [Replacing Judges with Juries (PoLL)](https://arxiv.org/abs/2404.18796): cross-family panels.
- Cook et al. 2024, [TICK: generated checklists](https://arxiv.org/abs/2410.03608): checklists against direct scoring.
- Min et al. 2023, [FActScore](https://arxiv.org/abs/2305.14251) (EMNLP 2023): atomic-fact precision against a source.
- Madaan et al. 2023, [Self-Refine](https://arxiv.org/abs/2303.17651) (NeurIPS 2023): feedback, refine and stop; specific against generic feedback; a cap of 4.
- Huang et al. 2023, [Large Language Models Cannot Self-Correct Reasoning Yet](https://arxiv.org/abs/2310.01798) (ICLR 2024).
- Tyen et al. 2023, [LLMs cannot find reasoning errors, but can correct them given the error location](https://arxiv.org/abs/2311.08516).
- Kamoi et al. 2024, [When Can LLMs Actually Correct Their Own Mistakes?](https://arxiv.org/abs/2406.01297) (TACL).
