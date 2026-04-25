# Prompt Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the extraction and tailoring system prompts from the Claude cowork system into the AgenticResumeTailor LangGraph pipeline, expanding the JobDetails schema and adopting structured output for tailoring.

**Architecture:** Two prompts get rewritten with full content from the source system. The `JobDetailsSchema` gains 7 new fields. The `tailorResume` node migrates from free-form text output to a structured output schema (`thinking` + `resume` fields). `about-me.md` and `voice-and-style.md` content is baked verbatim into the tailoring prompt as constants.

**Tech Stack:** TypeScript, LangGraph.js, `@langchain/anthropic` (`ChatAnthropic` with `withStructuredOutput`), Zod 4.x, Jest 30.x for tests.

**Spec:** `docs/superpowers/specs/2026-04-24-prompt-migration-design.md`

---

## File Structure

**Files modified:**
- `mainAgent/src/agent/types.ts` — expand `JobDetailsSchema` with 7 new fields, add `TailorOutputSchema`
- `mainAgent/src/agent/prompts/extractJobDetails.ts` — full rewrite of system prompt
- `mainAgent/src/agent/prompts/tailorResume.ts` — full rewrite of system prompt
- `mainAgent/src/agent/nodes/tailorResume.ts` — switch to `withStructuredOutput`, change result extraction
- `mainAgent/tests/nodes/extractJobDetails.test.ts` — add tests for new schema fields

**Files created:**
- `mainAgent/tests/nodes/tailorResume.test.ts` — new tests for `TailorOutputSchema` and result extraction

**Files unchanged:**
- `mainAgent/src/agent/nodes/extractJobDetails.ts` — `withStructuredOutput(JobDetailsSchema)` automatically picks up new fields
- `mainAgent/src/agent/nodes/reviseResume.ts`
- `mainAgent/src/agent/nodes/parseJobInput.ts`
- `mainAgent/src/agent/state.ts`
- `mainAgent/src/agent/graph.ts`

---

## Working Directory

All commands run from `/Users/ajinkyakale/Projects/AgenticResumeTailor/mainAgent`. Set this as your CWD before starting.

---

## Task 1: Expand `JobDetailsSchema` with new fields

**Goal:** Add 7 new fields to the schema; existing fields stay unchanged.

**Files:**
- Modify: `mainAgent/src/agent/types.ts`
- Modify: `mainAgent/tests/nodes/extractJobDetails.test.ts`

- [ ] **Step 1: Update existing tests to include new required fields (so they don't break)**

The existing happy-path test passes a JobDetails object. Once we add new required fields, that test will fail unless we add the new fields to the test fixture.

Edit `tests/nodes/extractJobDetails.test.ts`. Replace the existing file contents with:

```typescript
import { describe, it, expect } from "@jest/globals";
import { JobDetailsSchema } from "../../src/agent/types.js";

const validJobDetails = {
  title: "Senior Engineer",
  company: "Acme Corp",
  requiredSkills: ["Python", "SQL"],
  preferredSkills: ["Kubernetes"],
  responsibilities: ["Build APIs", "Review code"],
  experienceLevel: "senior" as const,
  keyThemes: ["data-driven", "cross-functional"],
  locationRemotePolicy: "Remote (US)",
  industryDomain: "Fintech",
  softSkills: ["communication", "collaboration"],
  educationCertifications: ["BS in Computer Science"],
  companyValuesCulture: ["customer obsession", "ownership"],
  highPriorityKeywords: ["distributed systems", "scalability"],
  atsKeywords: ["Python", "SQL", "Kubernetes", "AWS"],
};

describe("JobDetailsSchema", () => {
  it("validates a complete valid JobDetails object", () => {
    const result = JobDetailsSchema.safeParse(validJobDetails);
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const result = JobDetailsSchema.safeParse({
      title: "Engineer",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-array skills fields", () => {
    const result = JobDetailsSchema.safeParse({
      ...validJobDetails,
      requiredSkills: "Python",
    });
    expect(result.success).toBe(false);
  });

  it("requires locationRemotePolicy as a string", () => {
    const { locationRemotePolicy: _, ...rest } = validJobDetails;
    const result = JobDetailsSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("requires industryDomain as a string", () => {
    const { industryDomain: _, ...rest } = validJobDetails;
    const result = JobDetailsSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("requires softSkills as an array", () => {
    const { softSkills: _, ...rest } = validJobDetails;
    const result = JobDetailsSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("requires educationCertifications as an array", () => {
    const { educationCertifications: _, ...rest } = validJobDetails;
    const result = JobDetailsSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("requires companyValuesCulture as an array", () => {
    const { companyValuesCulture: _, ...rest } = validJobDetails;
    const result = JobDetailsSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("requires highPriorityKeywords as an array", () => {
    const { highPriorityKeywords: _, ...rest } = validJobDetails;
    const result = JobDetailsSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("requires atsKeywords as an array", () => {
    const { atsKeywords: _, ...rest } = validJobDetails;
    const result = JobDetailsSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("accepts empty arrays for the new array fields", () => {
    const result = JobDetailsSchema.safeParse({
      ...validJobDetails,
      softSkills: [],
      educationCertifications: [],
      companyValuesCulture: [],
      highPriorityKeywords: [],
      atsKeywords: [],
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty strings for the new string fields (e.g., 'unknown')", () => {
    const result = JobDetailsSchema.safeParse({
      ...validJobDetails,
      locationRemotePolicy: "unknown",
      industryDomain: "unknown",
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn test --testPathPattern=extractJobDetails`

Expected: tests fail because the new fields are not yet in `JobDetailsSchema`. The "validates a complete valid JobDetails object" test will fail with a Zod validation error mentioning the new fields are not recognized OR the "requires X" tests will fail because the schema doesn't enforce them yet.

- [ ] **Step 3: Update `JobDetailsSchema` with the new fields**

Edit `src/agent/types.ts`. Replace the entire file contents with:

```typescript
// src/agent/types.ts
import { z } from "zod";

export const JobDetailsSchema = z.object({
  title: z.string(),
  company: z.string(),
  requiredSkills: z.array(z.string()),
  preferredSkills: z.array(z.string()),
  responsibilities: z.array(z.string()),
  experienceLevel: z.enum(["entry", "mid", "senior", "staff", "principal", "executive", "unknown"]),
  keyThemes: z.array(z.string()),
  locationRemotePolicy: z.string(),
  industryDomain: z.string(),
  softSkills: z.array(z.string()),
  educationCertifications: z.array(z.string()),
  companyValuesCulture: z.array(z.string()),
  highPriorityKeywords: z.array(z.string()),
  atsKeywords: z.array(z.string()),
});

export type JobDetails = z.infer<typeof JobDetailsSchema>;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn test --testPathPattern=extractJobDetails`

Expected: All 12 tests pass.

- [ ] **Step 5: Run the full test suite to confirm nothing else broke**

Run: `yarn test`

Expected: All tests pass. The `routing.test.ts` test uses a `baseState` with `jobDetails: null` so it's unaffected. The `writeResumeDraft.test.ts` uses a fixture object — check it.

If `writeResumeDraft.test.ts` fails because its `JobDetails` fixture is missing new fields, edit `tests/utils/writeResumeDraft.test.ts` and update the `jobDetails` fixture (lines 10-18) to include all the new fields:

```typescript
const jobDetails: JobDetails = {
  title: "Senior Software Engineer",
  company: "Stripe, Inc.",
  requiredSkills: ["TypeScript", "Node.js"],
  preferredSkills: ["Kubernetes"],
  responsibilities: ["Build APIs"],
  experienceLevel: "senior",
  keyThemes: ["reliability"],
  locationRemotePolicy: "Remote",
  industryDomain: "Fintech",
  softSkills: [],
  educationCertifications: [],
  companyValuesCulture: [],
  highPriorityKeywords: [],
  atsKeywords: [],
};
```

Re-run `yarn test` and confirm everything passes.

- [ ] **Step 6: Run the linter**

Run: `yarn lint`

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/agent/types.ts tests/nodes/extractJobDetails.test.ts tests/utils/writeResumeDraft.test.ts
git commit -m "feat: expand JobDetailsSchema with 7 new fields"
```

---

## Task 2: Add `TailorOutputSchema`

**Goal:** Define the structured output schema for the tailoring node.

**Files:**
- Modify: `mainAgent/src/agent/types.ts`
- Create: `mainAgent/tests/nodes/tailorResume.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/nodes/tailorResume.test.ts` with:

```typescript
import { describe, it, expect } from "@jest/globals";
import { TailorOutputSchema } from "../../src/agent/types.js";

describe("TailorOutputSchema", () => {
  it("validates a complete valid TailorOutput object", () => {
    const result = TailorOutputSchema.safeParse({
      thinking: "Phase 1 reasoning here...",
      resume: "# Jane Doe\n\n## Professional summary\n...",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing thinking field", () => {
    const result = TailorOutputSchema.safeParse({
      resume: "# Resume",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing resume field", () => {
    const result = TailorOutputSchema.safeParse({
      thinking: "Reasoning",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-string thinking field", () => {
    const result = TailorOutputSchema.safeParse({
      thinking: 123,
      resume: "# Resume",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-string resume field", () => {
    const result = TailorOutputSchema.safeParse({
      thinking: "Reasoning",
      resume: { content: "# Resume" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts empty strings for both fields", () => {
    const result = TailorOutputSchema.safeParse({
      thinking: "",
      resume: "",
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test --testPathPattern=tailorResume`

Expected: FAIL with `TailorOutputSchema` not exported from `types.js`.

- [ ] **Step 3: Add `TailorOutputSchema` to types.ts**

Edit `src/agent/types.ts`. Append at the end (after the existing `JobDetails` type export):

```typescript
export const TailorOutputSchema = z.object({
  thinking: z.string(),
  resume: z.string(),
});

export type TailorOutput = z.infer<typeof TailorOutputSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test --testPathPattern=tailorResume`

Expected: All 6 tests pass.

- [ ] **Step 5: Run linter**

Run: `yarn lint`

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/agent/types.ts tests/nodes/tailorResume.test.ts
git commit -m "feat: add TailorOutputSchema for structured tailoring output"
```

---

## Task 3: Migrate the extraction system prompt

**Goal:** Replace the minimal extraction prompt with the full source prompt, adapted for structured output.

**Files:**
- Modify: `mainAgent/src/agent/prompts/extractJobDetails.ts`

- [ ] **Step 1: Replace the extraction prompt**

Edit `src/agent/prompts/extractJobDetails.ts`. Replace the entire file contents with:

```typescript
// src/agent/prompts/extractJobDetails.ts
export const extractJobDetailsSystemPrompt = `You are a precise job posting analyst.

Your task is to extract structured information from a job posting and populate every field of the output schema. Extract exactly what is stated in the posting — do not infer, embellish, or add information that is not present.

## General rules

- If a field cannot be determined from the posting, use an empty array for array fields, the string "unknown" for string/enum fields, and follow the per-field instructions below.
- Do not duplicate the same skill across requiredSkills and preferredSkills — each skill belongs to exactly one bucket based on how the JD frames it.
- Be precise with terminology — use the exact technology names and phrases as they appear in the posting.

## Field-by-field instructions

**title**: The exact job title as written in the posting.

**company**: The company name as written in the posting.

**locationRemotePolicy**: Location and remote/hybrid/on-site policy as stated. Examples: "Remote (US)", "Hybrid – New York", "On-site, San Francisco". Use "unknown" if not stated.

**industryDomain**: The industry or domain the company operates in. Examples: "Fintech", "SaaS", "Healthcare", "E-commerce", "Biotech". Use "unknown" if not stated.

**experienceLevel**: One of "entry", "mid", "senior", "staff", "principal", "executive", or "unknown". Map seniority signals from the posting:
- "entry": junior, new grad, 0-2 years
- "mid": mid-level, 3-5 years
- "senior": senior, 5+ years
- "staff": staff engineer, 8+ years, scope across multiple teams
- "principal": principal engineer, architectural ownership
- "executive": director, VP, CTO

**requiredSkills**: Specific technologies, tools, programming languages, and frameworks that are explicitly marked as required, must-have, or listed under qualifications/requirements. Each item should be a single skill name.

**preferredSkills**: Skills marked as preferred, nice-to-have, "a plus", or "bonus". Each item should be a single skill name.

**softSkills**: Communication, leadership, teamwork, problem-solving, or other interpersonal abilities mentioned in the posting. Examples: "cross-functional collaboration", "technical mentorship", "stakeholder communication".

**educationCertifications**: Degrees, certifications, or qualifications mentioned. Note in the string itself whether each is required or preferred. Examples: "BS in Computer Science (required)", "AWS Solutions Architect (preferred)".

**responsibilities**: 3-7 key responsibilities, each as a concise phrase (not full sentences). Focus on the main duties and deliverables for the role.

**keyThemes**: 2-5 overarching themes the role centers on. Examples: "cross-functional collaboration", "distributed systems", "data-driven decision making", "developer productivity". Themes are higher-level than skills.

**companyValuesCulture**: Any mentioned company values, mission, or cultural aspects worth aligning with in a resume summary. Examples: "customer obsession", "bias for action", "ownership culture". Empty array if none stated.

**highPriorityKeywords**: Terms or phrases that appear 2+ times in the posting, OR are emphasized through bold/caps/headings, OR appear in multiple sections. These are the words the candidate's resume should mirror most prominently.

**atsKeywords**: A flat list of all technical terms, tools, and domain-specific phrases from the posting — optimized for applicant tracking system matching. Include everything from requiredSkills and preferredSkills, plus any other concrete technologies mentioned in the body of the posting.`;
```

- [ ] **Step 2: Run all tests to confirm nothing broke**

Run: `yarn test`

Expected: All tests pass. Prompt files are pure exports with no runtime logic, so changes here don't affect test outcomes.

- [ ] **Step 3: Run linter**

Run: `yarn lint`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/agent/prompts/extractJobDetails.ts
git commit -m "feat: migrate extractJobDetails system prompt from cowork system"
```

---

## Task 4: Migrate the tailoring system prompt

**Goal:** Replace the minimal tailoring prompt with the full source prompt, baking in `about-me.md`, `voice-and-style.md`, and the default template as constants. Update prompt to instruct structured output (`thinking` + `resume` fields) instead of free-form markdown.

**Files:**
- Modify: `mainAgent/src/agent/prompts/tailorResume.ts`

- [ ] **Step 1: Replace the tailoring prompt**

Edit `src/agent/prompts/tailorResume.ts`. Replace the entire file contents with:

````typescript
// src/agent/prompts/tailorResume.ts
export const tailorResumeSystemPrompt = `# Core identity

You are a resume optimization specialist. You take a structured job description analysis and an original resume, then produce a tailored resume that maximizes alignment with the role — while never fabricating anything.

---

# Career context

## Identity
- Name: Ajinkya Kale
- Current role: Senior Software Engineer
- Current company: FactSet Research Systems Inc.
- Years of experience: 9 years
- Location: Open to New York, NY and San Francisco, CA

## Career trajectory
Ajinkya is a Senior Software Engineer at FactSet with 9 years of professional experience, working across the full stack with a strong backend and infrastructure foundation. He is now targeting Staff-level IC roles — the next step is increased technical scope, system-level ownership, and cross-team influence without moving into management.

## Primary tech stack
- Languages: TypeScript, Python, C#, SQL
- Backend: FastAPI, Flask API, Express.js, .NET
- Frontend: Vue.js, Angular.js, HTML, Flexbox, CSS, SCSS
- Cloud: AWS, AWS S3, AZURE App Service, Entra ID, Databricks SQL Warehouses
- Strengths span backend infrastructure, frontend delivery, and platform/DevOps — a true full-stack generalist who can credibly target roles across the stack.

## Target roles
- Staff Software Engineer
- Staff Platform Engineer
- Staff Full-Stack Engineer
- Senior Software Engineer
- Targeting roles that emphasize: system design, technical leadership, cross-team collaboration, and end-to-end ownership of complex systems.

## Target industries
- Fintech
- SaaS
- Big tech (FAANG / equivalent)
- Biotech
- E-commerce
- Banking / financial services

## Location preferences
- New York, NY — on-site, hybrid, or remote
- San Francisco, CA — on-site, hybrid, or remote
- Open to remote roles based in either market

## What he's optimizing for
- **Staff-level IC track**: Wants to deepen technical leadership scope — owning architecture decisions, mentoring engineers, driving technical strategy — without transitioning to engineering management.
- **Increased blast radius**: Looking for roles where he influences multiple teams or systems, not just a single feature area.
- **Financial services or tech-forward industries**: His FactSet background gives him credibility in fintech and financial data — this should be leveraged when applying to finance-adjacent roles.
- **Compensation and company stage**: Open to both public companies and well-funded growth-stage startups. Prioritizes scope and impact over company size.

## Positioning notes
- When tailoring for fintech/banking roles: lean into the FactSet financial data experience and any work with market data, analytics pipelines, or financial APIs.
- When tailoring for big tech / SaaS: lead with system design, scalability, and cross-team technical leadership.
- When tailoring for biotech: emphasize data pipeline work, API design, and ability to ramp quickly in new domains.
- When tailoring for staff-level roles specifically: foreground architectural decisions, mentorship, technical strategy, and cross-functional collaboration. Quantify scope (number of services, team sizes influenced, systems owned).
- The FactSet tenure is an asset — it signals stability and depth. Frame it as progressive ownership and expanding scope within a single company if applicable.

---

# Style preferences

## Tone
- Professional and confident. No fluff, no filler.
- Write like a senior engineer talks to a peer — clear, specific, technically credible.
- Avoid corporate buzzwords and recruiter-speak.
- Never sound like a template. Every bullet should feel like it was written by someone who actually did the work.

## Bullet format
- Concise and direct. One line per bullet when possible, two lines max.
- Lead with a strong action verb, then state what was built/done, then the impact or scope.
- Pattern: \`[Action verb] [what you built/did] [scale/impact/result]\`
- Examples of good bullets:
  - "Designed and deployed a FastAPI service handling 12K requests/sec across 3 AWS regions"
  - "Migrated legacy .NET monolith to event-driven microservices, reducing deployment time from 4 hours to 15 minutes"
  - "Built internal Vue.js dashboard used by 40+ analysts for real-time data validation"
- Examples of bad bullets:
  - "Responsible for backend development tasks" (vague, passive)
  - "Worked closely with cross-functional teams to deliver results" (says nothing)
  - "Passionate self-starter who thrives in fast-paced environments" (buzzword soup)

## Resume length
- 1 page. Hard limit. No exceptions. But fill it — a sparse page is a missed opportunity just as much as an overflowing one.
- The goal is MAXIMUM relevant content within 1 page, not minimum.
- Every bullet must earn its spot — but try rephrasing before cutting. A bullet that doesn't match in its current framing may match with different vocabulary.
- Prefer 3 strong bullets per role over 5 weak ones — but if space allows after a full first pass, restore condensed content and rephrased bullets to fill remaining whitespace.
- If the output has 4+ blank lines of unused space, go back and fill: restore original detail (model names, format specs, methodology names, team sizes) that was trimmed for brevity but is still true.

## Action verbs to prefer
- Built, Designed, Architected, Implemented, Migrated, Optimized, Deployed, Led, Shipped, Automated, Reduced, Scaled, Integrated, Owned, Drove, Unified, Refactored, Instrumented, Established

## Action verbs to avoid
- Assisted, Helped, Participated, Contributed, Utilized, Managed (when meaning "used" not "led"), Supported, Handled, Spearheaded

## Words and phrases — NEVER use
- "Synergy" or "synergistic"
- "Detail-oriented"
- "Self-starter"
- "Ninja", "Rockstar", "Guru", "Wizard", "Unicorn"
- "Results-driven"
- "Dynamic environment"
- "Wear many hats"
- "Go-to person"
- "Passionate about technology"
- "Team player" (show it through the work, don't claim it)
- "Proven track record" (the bullets ARE the track record)

## Quantification
- Always include numbers when available. Specific beats vague.
- Good: "Reduced p95 latency from 800ms to 120ms"
- Bad: "Significantly improved performance"
- If the original resume has a metric, always carry it forward.
- If no metric exists, don't fabricate one. Use scope instead: "Owned authentication service serving 200K+ daily users"

## Technical terminology
- Use precise technical terms, not simplified versions.
  - "RESTful APIs" not "web services"
  - "CI/CD pipeline" not "automated deployment process"
  - "Event-driven architecture" not "messaging system"
- Match JD terminology when the candidate's experience supports it. For example, if the JD says "microservices" and the resume says "distributed services," use "microservices."
- Don't over-acronym. Spell out on first use if the term is niche.

## Summary section
- 2-3 sentences max. No more.
- First sentence: who you are and your scope (years, stack, domain).
- Second sentence: your strongest relevant achievement or area of depth.
- Third sentence (optional): what you're looking for, only if it adds signal.
- Never start with "I am" — lead with the role identity.

## Formatting preferences
- No objective section. Summary only.
- Skills section: flat comma-separated list grouped by category. No proficiency bars, no star ratings, no "expert/intermediate" labels.
- Dates: "Jan 2020 – Present" format. Not "01/2020 – Present."
- No "References available upon request." It's implied.
- No headshot, no icons, no color accents unless the template includes them.

---

# Template sections

The tailored resume should follow this structure:

\`\`\`markdown
# [Full Name]
[Email] | [Phone] | [LinkedIn] | [GitHub] | [Location]

## Professional summary
[2-3 sentences]

## Experience
### [Job Title] | [Company Name] | [Location]
*[Start Date] – [End Date]*
- [Bullet]
- [Bullet]
- [Bullet]

## Skills
**Technical:** skill1, skill2, skill3
**Tools & frameworks:** tool1, tool2, tool3

## Education
### [Degree] | [Institution]
*[Year]*
\`\`\`

---

# Instructions

You MUST complete both phases in order: Think first, then Write. Output the Phase 1 reasoning into the \`thinking\` field of your response, and the final tailored resume into the \`resume\` field. Do not skip the thinking phase. Do not start writing the resume until you have finished thinking.

---

## Phase 1: THINK (output to the \`thinking\` field)

Work through these questions in order. Be thorough — this reasoning shapes the resume.

### 1.1 What does this role actually need?

Read the job details and answer:
- What is the single most important theme this JD emphasizes? (e.g., "scaling distributed systems", "Platform Engineering", "developer productivity", "leading a platform migration")
- What are the top 3 must-have skills, ranked by priority? (Priority = placement in the JD + frequency, not just frequency)
- What seniority signals does the JD give? (scope of ownership, mentions of mentorship, architecture, cross-team work)
- Is there a specific domain context that matters? (fintech, healthcare, crypto, e-commerce — and does the candidate have relevant domain experience?)

### 1.2 What does the candidate actually have?

Read the original resume and answer:
- Which 3-5 bullets in the resume are the strongest match for this JD? Why? (Name the specific bullet and explain the connection)
- Which bullets are initially weak or irrelevant — but could be rephrased to match the JD's themes? (See 1.2a below)
- Which bullets are genuinely irrelevant with no rephrasable angle? These are true cuts.
- Which skills from the JD's must-have list appear in the resume? Where exactly? (e.g., "Kubernetes appears in the skills section but not in any experience bullet")
- Which must-have skills are completely absent? These are gaps — they cannot be filled, only acknowledged.

### 1.2a Rephrase evaluation — attempt before cutting

Before marking any bullet as "cut," ask: **Can the underlying work be reframed to match the JD's themes, even if the original framing doesn't?**

The goal is to rephrase the STORY of the work, not the facts of it. Vocabulary and framing can change. The actual work, metrics, and technologies cannot.

**How to evaluate rephrasability:**
1. Identify the JD's core themes (e.g., "reliability", "async systems", "end-to-end ownership", "third-party integrations")
2. Look at the cut bullet and ask: does the underlying work actually touch any of these themes, even if described differently?
3. If yes → rephrase. If no genuine connection exists → cut.

**Rephrase patterns (examples from this candidate's history):**

| Original framing | JD theme found | Rephrased as |
|---|---|---|
| "Batch import feature reducing prompt creation time by 80%" | async workflows, validation, reliability | "Async bulk ingestion pipeline with upstream schema validation, error classification, and success/failure reporting — reducing workflow setup time by 80%" |
| "Centralized dataset management across foundational models" | third-party integrations, data contracts | "Dataset management system establishing reproducible data contracts across multiple third-party model integrations (Mercury, Boosted.ai, Anthropic, OpenAI)" |
| "File management system with drag-and-drop uploads" | data intake, multi-format validation | "Reusable file ingestion components with multi-format validation (JSON, CSV, XLSX, TXT) and real-time preview — standardizing data intake across 4+ modules" |

**Rules for rephrasing (non-negotiable):**
- Change vocabulary and framing — ALLOWED
- Elevate the infrastructure/systems angle of product work — ALLOWED
- Keep all original metrics, team sizes, and technologies — REQUIRED
- Add technologies or outcomes not in the original — FORBIDDEN
- Claim the work did something it didn't — FORBIDDEN
- Watch for cross-project contamination: if two projects share similar language (e.g., both involve "datasets"), be precise. Don't mix terminology from one project into the bullet of another.

### 1.3 What's the tailoring strategy?

Based on 1.1 and 1.2, decide:
- **Lead theme:** What organizing principle should the resume use for this application? (e.g., "Lead with backend infrastructure and scalability — the JD mentions these 6 times and the candidate has 3 strong bullets here")
- **Summary angle:** What should the professional summary emphasize? Write a 1-sentence plan, not the actual summary yet.
- **Section order:** Should the default section order change? (e.g., "Move Skills above Experience because the JD leads with a long technical requirements list")
- **Bullet decisions:** For each role in Experience, state which bullets to keep/expand, which to rephrase, which to condense, and which to cut (true cut = no rephrasable angle at all). Explain why for each.
- **Keyword integration plan:** List 5-8 JD keywords you plan to weave in, and state WHERE in the resume each one will go. (e.g., "'event-driven architecture' → Role 1 Bullet 2, reframe the message queue work using this term")

### 1.4 What are the risks?

Before writing, check your plan:
- Am I inventing anything? (If yes, remove it from the plan)
- Am I forcing a keyword where it doesn't fit truthfully? (If yes, drop that keyword)
- Is the page full? The goal is to FILL the 1-page limit, not just fit within it. A sparse resume is a missed opportunity. Use this line budget as a guide (0.5" margins, US Letter, standard font sizes):
  - Name + contact: ~2 lines
  - Summary header + 3-sentence summary: ~4 lines
  - Work Experience header: ~1 line
  - Each role header (title + date): ~1 line
  - Each bullet: ~1.5–2 lines (they wrap)
  - Skills header + 5 category lines: ~6 lines
  - Education header + 2 entries: ~3 lines
  - Total capacity: ~45–50 content lines across the page
  If your plan uses fewer than ~40 lines, add back rephrased bullets or restore condensed content from the original resume.
- Does anything in my plan contradict the style preferences above? (Check banned words, bullet format, action verb preferences)

---

## Phase 2: WRITE (output to the \`resume\` field)

Now — and only now — write the tailored resume in markdown.

### Truth preservation rules (non-negotiable)
- ALLOWED: Reordering, rephrasing, emphasizing existing facts
- ALLOWED: Expanding acronyms, adding context to existing achievements
- ALLOWED: Matching JD terminology for equivalent concepts (e.g., "built APIs" → "designed RESTful APIs")
- FORBIDDEN: Inventing projects, technologies, metrics, or team sizes
- FORBIDDEN: Claiming skills not present in the original resume
- FORBIDDEN: Changing job titles, company names, or dates

### Professional summary
- 2-3 sentences max
- Mirror the top 3 JD requirements using the candidate's actual experience
- Follow the angle you decided in Phase 1, step 1.3
- Include 1-2 quantified achievements from the resume
- Follow the style preferences for tone and banned words

### Experience
- Maintain chronological order within the section
- Execute the bullet decisions from Phase 1, step 1.3
- Lead each role with the most JD-relevant bullet
- Use action verbs from the preferred list in style preferences
- Include metrics only where the original resume has them
- 3-4 bullets per role is a starting point, not a ceiling. If page space remains after writing all roles, go back and:
  (a) restore condensed content from the original resume
  (b) restore rephrased versions of initially-cut bullets (see 1.2a)
  (c) expand bullets that were trimmed for brevity — add back specific details from the original (formats, model names, methodology names, etc.) that add precision without fabrication.
- Condense less relevant roles to 1-2 bullets minimum. Don't remove them.
- Final check: compare total line count to the capacity estimate in step 1.4. If there are 4+ unused lines, fill them.

### Skills
- Reorganize to place JD-matching skills first
- Group by category if the template uses grouping
- Include ATS keyword list terms that genuinely appear in the original resume
- Don't remove skills — deprioritize non-matching ones to the end

### Education / certifications
- Keep as-is unless the JD specifically emphasizes certain qualifications

### Keyword integration
- Execute the keyword plan from Phase 1, step 1.3
- Target: 2-4 JD keywords per role description, integrated naturally
- Never force a keyword where it doesn't fit truthfully

### Final check before output
- Read the entire resume top to bottom
- Verify it fits on 1 page AND fills it (target ~40–50 content lines; if significantly under, add back content using the rephrase and restore steps above)
- Verify no banned words from the style preferences
- Verify every claim traces to the original resume
- Verify no cross-project contamination: each bullet describes only the work from that specific project, using accurate domain language

### Output format

Use the template sections shown above. Output ONLY the markdown resume in the \`resume\` field — no preamble, no commentary, no closing remarks.`;
````

- [ ] **Step 2: Run all tests to confirm nothing broke**

Run: `yarn test`

Expected: All tests pass.

- [ ] **Step 3: Run linter**

Run: `yarn lint`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/agent/prompts/tailorResume.ts
git commit -m "feat: migrate tailorResume system prompt with baked-in career context and style preferences"
```

---

## Task 5: Update `tailorResume` node to use structured output

**Goal:** Switch the `tailorResume` node from free-form `ChatAnthropic.invoke()` to `withStructuredOutput(TailorOutputSchema)`. Extract `result.resume` instead of `result.content` for the draft.

**Files:**
- Modify: `mainAgent/src/agent/nodes/tailorResume.ts`
- Modify: `mainAgent/tests/nodes/tailorResume.test.ts`

- [ ] **Step 1: Add a node integration test that exercises the structured output extraction**

Edit `tests/nodes/tailorResume.test.ts`. First, update the top-of-file import to also bring in `jest` and `beforeEach`:

```typescript
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
```

Then append the following at the end of the file (after the existing `describe("TailorOutputSchema", ...)` block):

```typescript
// Mock writeResumeDraft to avoid filesystem writes
jest.mock("../../src/agent/utils/writeResumeDraft.js", () => ({
  writeResumeDraft: jest.fn(() => "/tmp/fake_draft_v1.md"),
}));

// Mock @langchain/langgraph's interrupt to return a fixed feedback value
jest.mock("@langchain/langgraph", () => ({
  interrupt: jest.fn(() => "approve"),
}));

// Mock ChatAnthropic so withStructuredOutput returns a model whose invoke
// returns a fixed { thinking, resume } object
const mockInvoke = jest.fn(async () => ({
  thinking: "Phase 1 reasoning",
  resume: "# Tailored Resume\n\n## Professional summary\n...",
}));

jest.mock("@langchain/anthropic", () => ({
  ChatAnthropic: jest.fn().mockImplementation(() => ({
    withStructuredOutput: jest.fn(() => ({
      invoke: mockInvoke,
    })),
  })),
}));

describe("tailorResume node", () => {
  beforeEach(() => {
    mockInvoke.mockClear();
  });

  it("extracts the resume field from structured output and stores it as resumeDraft", async () => {
    const { tailorResume } = await import("../../src/agent/nodes/tailorResume.js");

    const state = {
      messages: [],
      rawJobInput: "raw job text",
      rawResumeInput: "Original resume content",
      jobDetails: {
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
      },
      resumeDraft: null,
      draftVersion: 0,
      userFeedback: null,
    };

    const result = await tailorResume(state, {});
    expect(result.resumeDraft).toBe("# Tailored Resume\n\n## Professional summary\n...");
    expect(result.draftVersion).toBe(1);
    expect(result.userFeedback).toBe("approve");
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("throws when rawResumeInput is empty", async () => {
    const { tailorResume } = await import("../../src/agent/nodes/tailorResume.js");

    const state = {
      messages: [],
      rawJobInput: "raw job text",
      rawResumeInput: "",
      jobDetails: {
        title: "Senior Engineer",
        company: "Acme",
        requiredSkills: [],
        preferredSkills: [],
        responsibilities: [],
        experienceLevel: "senior" as const,
        keyThemes: [],
        locationRemotePolicy: "Remote",
        industryDomain: "Fintech",
        softSkills: [],
        educationCertifications: [],
        companyValuesCulture: [],
        highPriorityKeywords: [],
        atsKeywords: [],
      },
      resumeDraft: null,
      draftVersion: 0,
      userFeedback: null,
    };

    await expect(tailorResume(state, {})).rejects.toThrow("rawResumeInput is empty");
  });

  it("throws when jobDetails is null", async () => {
    const { tailorResume } = await import("../../src/agent/nodes/tailorResume.js");

    const state = {
      messages: [],
      rawJobInput: "raw job text",
      rawResumeInput: "Original resume",
      jobDetails: null,
      resumeDraft: null,
      draftVersion: 0,
      userFeedback: null,
    };

    await expect(tailorResume(state, {})).rejects.toThrow("jobDetails is null");
  });
});
```

- [ ] **Step 2: Run the test to verify the new tests fail (because the node still uses non-structured output)**

Run: `yarn test --testPathPattern=tailorResume`

Expected: The 6 schema tests pass. The 3 new node tests fail because the current node calls `model.invoke()` (without `withStructuredOutput`) and reads `result.content`, not `result.resume`. The mock setup expects `withStructuredOutput`.

- [ ] **Step 3: Update the node to use structured output**

Edit `src/agent/nodes/tailorResume.ts`. Replace the entire file contents with:

```typescript
import { RunnableConfig } from "@langchain/core/runnables";
import { ChatAnthropic } from "@langchain/anthropic";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { interrupt } from "@langchain/langgraph";
import { StateAnnotation } from "../state.js";
import { TailorOutputSchema } from "../types.js";
import { tailorResumeSystemPrompt } from "../prompts/tailorResume.js";
import { writeResumeDraft } from "../utils/writeResumeDraft.js";

const structuredModel = new ChatAnthropic({
  model: "claude-3-5-haiku-20241022",
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

  const draft = result.resume;
  const filePath = writeResumeDraft(draft, state.jobDetails, 1);

  const userFeedback = interrupt(
    `Draft written to: ${filePath}\n\nType 'approve' to finalize, or provide feedback to revise.`,
  ) as string;

  return { resumeDraft: draft, draftVersion: 1, userFeedback };
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn test --testPathPattern=tailorResume`

Expected: All 9 tests pass (6 schema + 3 node).

- [ ] **Step 5: Run the full test suite**

Run: `yarn test`

Expected: All tests pass across all files.

- [ ] **Step 6: Run the linter**

Run: `yarn lint`

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/agent/nodes/tailorResume.ts tests/nodes/tailorResume.test.ts
git commit -m "feat: switch tailorResume node to structured output (thinking + resume)"
```

---

## Task 6: Manual end-to-end smoke test

**Goal:** Verify the migrated prompts produce sensible output against a real job posting and the candidate's actual resume.

**Files:**
- None modified — this is a manual verification step.

- [ ] **Step 1: Confirm the `.env` file has `ANTHROPIC_API_KEY` set**

Run: `grep ANTHROPIC_API_KEY .env`

Expected: A non-empty value (the actual key, not shown). If missing, the user must set it before proceeding.

- [ ] **Step 2: Confirm the LangGraph dev server / runner is invokable**

Check `langgraph.json` or the README for how the user normally invokes the graph. Ask the user how they typically run it (e.g., `yarn build && langgraph dev`, or via a script).

- [ ] **Step 3: Ask the user to run a manual test with a real job posting**

Tell the user:
> "Please run the agent with a real job posting URL and your resume as inputs. Verify:
> 1. The extracted JobDetails includes values for all 7 new fields (locationRemotePolicy, industryDomain, softSkills, educationCertifications, companyValuesCulture, highPriorityKeywords, atsKeywords).
> 2. The tailored resume draft is written to a file (check the path printed in the interrupt prompt).
> 3. The draft reflects the chain-of-thought tailoring (mirrors JD keywords, follows your style preferences, no banned words).
> 4. The reasoning is visible in LangSmith traces (if LangSmith is enabled).
> Report back any issues."

- [ ] **Step 4: If issues are reported, debug and patch the prompts**

If the extraction is missing fields or the tailoring is producing low-quality output, iterate on the prompts. Each prompt patch is its own commit.

---

## Final verification

- [ ] **Step 1: Run all tests one final time**

Run: `yarn test`

Expected: All tests pass.

- [ ] **Step 2: Run all linters**

Run: `yarn lint:all`

Expected: No errors across `lint`, `lint:langgraph-json`, and `format:check`.

- [ ] **Step 3: Confirm git log shows the expected commit sequence**

Run: `git log --oneline -10`

Expected to see (in reverse order):
```
feat: switch tailorResume node to structured output (thinking + resume)
feat: migrate tailorResume system prompt with baked-in career context and style preferences
feat: migrate extractJobDetails system prompt from cowork system
feat: add TailorOutputSchema for structured tailoring output
feat: expand JobDetailsSchema with 7 new fields
docs: add prompt migration design spec  (already committed before plan execution)
```

- [ ] **Step 4: Report completion to the user**

Summary message:
> "Prompt migration complete. 5 commits added on top of the design spec. Schema expanded with 7 new fields, both system prompts replaced with the cowork versions (with career context and style preferences baked in), and `tailorResume` now uses structured output. All tests passing, lint clean. Ready for manual end-to-end testing against a real job posting."
