# Prompt Migration Design Spec

**Date:** 2026-04-24
**Scope:** Migrate extraction and tailoring system prompts from Claude cowork system into the AgenticResumeTailor LangGraph pipeline

---

## Overview

The current `extractJobDetails` and `tailorResume` system prompts are minimal placeholders. The Claude cowork system has battle-tested prompts (`extraction-rules.md` and `tailoring-rules.md`) that produce significantly better results. This spec covers migrating those prompts into the LangGraph project, adapting them to work with structured output and the existing graph architecture.

**Source files (read-only references, not modified):**
- `~/ClaudeProjects/resume_tailoring/Context/extraction-rules.md`
- `~/ClaudeProjects/resume_tailoring/Context/tailoring-rules.md`
- `~/ClaudeProjects/resume_tailoring/Context/about-me.md`
- `~/ClaudeProjects/resume_tailoring/Context/voice-and-style.md`

---

## Change 1: Expand `JobDetailsSchema` and extraction prompt

### Schema changes (`src/agent/types.ts`)

Add these fields to `JobDetailsSchema`:

```typescript
export const JobDetailsSchema = z.object({
  // Existing fields (unchanged)
  title: z.string(),
  company: z.string(),
  requiredSkills: z.array(z.string()),
  preferredSkills: z.array(z.string()),
  responsibilities: z.array(z.string()),
  experienceLevel: z.enum(["entry", "mid", "senior", "staff", "principal", "executive", "unknown"]),
  keyThemes: z.array(z.string()),

  // New fields
  locationRemotePolicy: z.string(),
  industryDomain: z.string(),
  softSkills: z.array(z.string()),
  educationCertifications: z.array(z.string()),
  companyValuesCulture: z.array(z.string()),
  highPriorityKeywords: z.array(z.string()),
  atsKeywords: z.array(z.string()),
});
```

**Field definitions (from source `extraction-rules.md`):**
- `locationRemotePolicy`: Location and remote/hybrid/onsite policy as stated in the JD
- `industryDomain`: Industry or domain the company operates in (e.g., "Fintech", "SaaS", "Healthcare")
- `softSkills`: Communication, leadership, teamwork, problem-solving, or other interpersonal abilities mentioned
- `educationCertifications`: Degrees, certifications, or qualifications — note whether required or preferred
- `companyValuesCulture`: Any mentioned company values, mission, or cultural aspects worth aligning with in a resume summary
- `highPriorityKeywords`: Terms or phrases that appear 2+ times in the JD, or are emphasized (bold, caps, repeated across sections). These should be mirrored in the tailored resume.
- `atsKeywords`: Flat list of all technical terms, tools, and domain-specific phrases from the JD — optimized for applicant tracking system matching

### Prompt changes (`src/agent/prompts/extractJobDetails.ts`)

Replace the current minimal prompt with the full source extraction prompt, adapted for structured output. The key adaptation: instead of asking the model to produce markdown headers, instruct it to populate each schema field. Extraction rules stay the same — extract what is stated, do not infer or embellish. If a field cannot be determined, use an empty array or `"unknown"`.

### Node changes (`src/agent/nodes/extractJobDetails.ts`)

No code changes needed. The node already uses `withStructuredOutput(JobDetailsSchema)` — expanding the schema is sufficient.

---

## Change 2: Add `TailorOutputSchema`

### New type (`src/agent/types.ts`)

```typescript
export const TailorOutputSchema = z.object({
  thinking: z.string(),
  resume: z.string(),
});

export type TailorOutput = z.infer<typeof TailorOutputSchema>;
```

- `thinking`: Phase 1 chain-of-thought reasoning (strategy, bullet decisions, keyword plan, risk check)
- `resume`: Phase 2 complete tailored resume in markdown

---

## Change 3: Migrate tailoring prompt

### Prompt changes (`src/agent/prompts/tailorResume.ts`)

Replace the current minimal prompt with the full source tailoring prompt (`tailoring-rules.md`), with these adaptations:

**Constants baked in (not runtime inputs):**

1. **Career context** — full content of `about-me.md` embedded verbatim under a `## Career context` section in the prompt. Includes identity, career trajectory, primary tech stack, target roles, target industries, location preferences, optimization goals, and positioning notes.

2. **Style preferences** — full content of `voice-and-style.md` embedded verbatim under a `## Style preferences` section. Includes tone rules, bullet format (action verb + what + impact), resume length (1 page hard limit, fill it), preferred/banned action verbs, banned words/phrases, quantification rules, technical terminology rules, summary section rules, and formatting preferences.

3. **Template sections** — the default markdown template from the source prompt's output format section (no separate template file exists):
   ```
   # [Full Name]
   [Email] | [Phone] | [LinkedIn] | [GitHub] | [Location]
   ## Professional summary
   ## Experience
   ### [Job Title] | [Company Name] | [Location]
   ## Skills
   ## Education
   ```

**Prompt structure:**

```
1. Core identity
   "You are a resume optimization specialist..."

2. Career context
   (about-me.md content verbatim)

3. Style preferences
   (voice-and-style.md content verbatim)

4. Template sections
   (default markdown template)

5. Instructions
   "You MUST complete both phases in order: Think, then Write.
    Output the thinking to the `thinking` field and the resume
    to the `resume` field."

6. Phase 1: THINK (output to `thinking` field)
   1.1 What does this role actually need?
       - Single most important JD theme
       - Top 3 must-have skills ranked by priority
       - Seniority signals
       - Domain context relevance
   1.2 What does the candidate actually have?
       - 3-5 strongest matching bullets (named + explained)
       - Rephrasable bullets (weak framing but connectable to JD themes)
       - Genuinely irrelevant bullets (true cuts)
       - Must-have skills present and where they appear
       - Must-have skills absent (gaps)
   1.2a Rephrase evaluation — attempt before cutting
       - Rephrase patterns with concrete examples:
         | Original framing | JD theme found | Rephrased as |
         |---|---|---|
         | "Batch import feature reducing prompt creation time by 80%" | async workflows, validation, reliability | "Async bulk ingestion pipeline with upstream schema validation, error classification, and success/failure reporting — reducing workflow setup time by 80%" |
         | "Centralized dataset management across foundational models" | third-party integrations, data contracts | "Dataset management system establishing reproducible data contracts across multiple third-party model integrations (Mercury, Boosted.ai, Anthropic, OpenAI)" |
         | "File management system with drag-and-drop uploads" | data intake, multi-format validation | "Reusable file ingestion components with multi-format validation (JSON, CSV, XLSX, TXT) and real-time preview — standardizing data intake across 4+ modules" |
       - Rules: change vocabulary/framing (allowed), elevate infrastructure angle (allowed), keep original metrics/technologies (required), add technologies not in original (forbidden), cross-project contamination (forbidden)
   1.3 Tailoring strategy
       - Lead theme + reasoning
       - Summary angle (1-sentence plan)
       - Section order (default or changed + why)
       - Bullet decisions per role (keep/expand/rephrase/condense/cut + why)
       - Keyword integration plan (5-8 keywords with placement locations)
   1.4 Risk check
       - Fabrication check
       - Keyword forcing check
       - Page fill check (line budget: ~45-50 content lines for 1-page resume)
       - Style preferences compliance check

7. Phase 2: WRITE (output to `resume` field)
   - Truth preservation rules (reorder/rephrase/emphasize allowed; invent/fabricate forbidden)
   - Professional summary: 2-3 sentences, mirror top 3 JD requirements, follow style preferences
   - Experience: chronological, execute bullet decisions from Phase 1, lead each role with most relevant bullet, 3-4 bullets per role starting point, restore content if space remains
   - Skills: reorganize to place JD-matching first, include ATS terms that genuinely appear in original resume
   - Education: keep as-is unless JD emphasizes specific qualifications
   - Keyword integration: execute plan from Phase 1, target 2-4 JD keywords per role
   - Final check: fits 1 page AND fills it, no banned words, every claim traces to original resume, no cross-project contamination
   - Output format: match template sections
```

**What gets dropped from the source prompt:**
- Phase 3 (tailoring log) — replaced by LangGraph/LangSmith tracing
- `{template_sections}` input variable — baked as constant
- `{career_context}` input variable — baked as constant
- `{style_preferences}` input variable — baked as constant
- `{requirements_analysis}` / `{original_resume}` placeholders — these come from the human message, not the system prompt
- Error handling section (incomplete inputs, uncertain rephrasing) — the pipeline validates inputs before reaching this node

---

## Change 4: Update `tailorResume` node

### Node changes (`src/agent/nodes/tailorResume.ts`)

```typescript
// Model changes from plain to structured
const structuredModel = new ChatAnthropic({
  model: "claude-3-5-haiku-20241022",
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 2,
}).withStructuredOutput(TailorOutputSchema);
```

**Output handling changes:**
- Current: `result.content` (string) becomes `resumeDraft`
- New: `result.resume` (string) becomes `resumeDraft`; `result.thinking` is captured in LangSmith traces via the structured output response

**Human message** stays the same shape:
```
Original Resume:
{state.rawResumeInput}

Job Details:
{JSON.stringify(state.jobDetails, null, 2)}
```

The expanded `jobDetails` (with new fields like `atsKeywords`, `highPriorityKeywords`, `softSkills`, etc.) flows through automatically since it's serialized from state.

---

## No changes

- **`reviseResume.ts`** — operates on `resumeDraft` + `userFeedback`, doesn't need the full tailoring prompt or structured output. No system prompt needed (targeted edits, not full rewrites).
- **`parseJobInput.ts`** — URL fetching / text passthrough, unrelated to prompts.
- **`graph.ts`** — graph structure unchanged (same nodes, same edges, same conditional routing).
- **`state.ts`** — no new state fields needed. `jobDetails` already holds `JobDetails | null`, which will include the expanded fields. `resumeDraft` already holds the markdown string.

---

## Token budget estimate

**extractJobDetails:**
- System prompt: ~300 tokens (expanded from ~150)
- Human message (job posting text): ~500-2,000 tokens (unchanged)
- Output (structured): ~300-500 tokens (expanded from ~200)
- **Per-call cost on Haiku 3.5:** ~$0.001-0.002

**tailorResume:**
- System prompt: ~2,500-3,500 tokens (expanded from ~200; includes career context, style preferences, full instructions)
- Human message (resume + job details): ~1,500-2,500 tokens (slightly larger due to expanded job details)
- Output — thinking field: ~1,000-2,000 tokens (new)
- Output — resume field: ~800-1,200 tokens (unchanged)
- **Per-call cost on Haiku 3.5:** ~$0.005-0.008

**Total pipeline cost per run:** ~$0.006-0.010 (up from ~$0.003-0.005)
