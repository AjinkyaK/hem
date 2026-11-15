# Running a containerised agent on GitHub Actions

Research for [#28](https://github.com/AjinkyaK/hem/issues/28), part of the
autonomous Hem PRD map ([#27](https://github.com/AjinkyaK/hem/issues/27)).

**Question.** How do you run a containerised Python agent as a GitHub Actions
workflow, and keep the Applicant's data private, given that `AjinkyaK/hem` is
public?

Sources are GitHub Docs pages, read on 2026-11-15. Each claim links to the
page that states it. Statements marked **(inference)** are conclusions drawn
from the cited facts, not things the docs say outright.

## Answer in brief

- **Never run an Applicant's data through a workflow in the public `hem`
  repo.** On a public repo, every signed-in GitHub user has read access, and
  read access is enough to view and download logs and artifacts. Anyone who can
  open a pull request can read caches.
- **Run Hem in a private workspace repo that belongs to the Applicant.** The
  public engine is shipped as a **public GHCR image** plus a **public reusable
  workflow** in `hem`. The run, its logs and its artifacts all belong to the
  private caller repo.
- **Trigger it with `workflow_dispatch`.** It takes up to 25 typed inputs and
  65,535 characters in total, which is enough for a Job Posting URL or the
  pasted posting text. It can be fired from the UI, `gh workflow run`, or the
  REST API, which now returns the run ID and URL. `repository_dispatch`
  (10 top-level properties, under 64 KB) suits an external caller.
  `issues`/`issue_comment` work, but in the private repo only.
- **Private inputs.** Keep the Base Resume and targeting notes as files in the
  private workspace repo, and check them out. Pass `ANTHROPIC_API_KEY` as a
  repository secret, explicitly, to the reusable workflow.
- **Results.** Commit the result to a branch and open a PR in the workspace
  repo. This is private and durable, and it is reviewable. Artifacts are a
  secondary option: they expire after 90 days by default (1–400 days are
  allowed on a private repo).
- **Cost.** GitHub Free includes $12/month of Actions compute, which is about
  2,000 Linux 2-core minutes at $0.006/min. Public repos are free. GHCR storage
  and bandwidth are currently free. Pulling a prebuilt image is faster than
  building one on every run.
- **Limits.** A job is capped at 6 h (`timeout-minutes` default 360). Docker
  and container jobs need Linux runners.

## 1. Triggers: what can carry a Job Posting

All four triggers run only when the workflow file exists on the **default
branch** ([Events that trigger workflows][events]).

| Trigger | Carries data? | Limits | Who can fire it |
|---|---|---|---|
| `workflow_dispatch` | Typed `inputs`: `boolean`, `choice`, `number`, `environment`, `string` ([workflow syntax][syntax]) | "maximum number of top-level properties for `inputs` is 25"; "maximum payload for `inputs` is 65,535 characters" ([events]) | UI "Run workflow" button, `gh`, or REST. Classic tokens "need the repo scope" ([REST: workflow dispatch][rest-wd]) |
| `repository_dispatch` | Free-form `client_payload` JSON plus `event_type` | "maximum number of top-level properties is 10. The total size of the JSON payload must be less than 64KB"; `event_type` "100 characters or fewer" ([REST: repository dispatch][rest-rd]) | REST only. Classic tokens "need the repo scope" ([rest-rd]) |
| `issues` | Issue title/body via `github.event.issue` | No documented limit beyond issue size | Anyone who can open an issue in the repo |
| `issue_comment` | Comment body via `github.event.comment`; fires on issue **and** PR comments ([events]) | Same as above | Anyone who can comment |

Notes:

- The workflow-dispatch REST endpoint returns `200` with `workflow_run_id`,
  `run_url` and `html_url` ([rest-wd]). A caller can therefore poll the run it
  started instead of guessing which run is theirs.
- After a first run, a `workflow_dispatch` workflow "can [be dispatched]
  against any branch or tag via the GitHub API or GitHub CLI" ([events]).
- Events created with `GITHUB_TOKEN` do not start new workflow runs, except
  `workflow_dispatch` and `repository_dispatch` ([events]). So one workflow can
  chain into another only through those two.
- **Script injection.** Issue and comment text is untrusted input. GitHub's
  preferred mitigation is to "set the value of the expression to an
  intermediate environment variable" rather than interpolate `${{ }}` into a
  `run:` script ([Secure use reference][secure]). The same rule applies to a
  `string` dispatch input that holds pasted posting text.
- **(inference)** On a public repo, any GitHub user can open an issue or
  comment. An `issues` or `issue_comment` trigger there would let strangers
  spend the owner's API key. In a private workspace, only collaborators can.

**Fit for Hem.** Use `workflow_dispatch` with one `string` input,
`job_posting`, which takes a URL or the pasted text. The 65,535-character
budget covers a typical posting. An issue-based "paste the posting into an
issue" flow is a good later UX, and only in the private workspace.

## 2. Private inputs, and what is visible on public versus private repos

### Visibility

| Surface | Who can see it | Retention | Source |
|---|---|---|---|
| Workflow run logs | Must be signed in "even for public repositories", plus repository read access. Read access can also **download** logs. Deleting logs needs write access | 90 days by default | [Using workflow run logs][logs], [retention] |
| Artifacts | "Read access to the repository is required" to download | 90 days by default. Public repos 1–90 days, private repos 1–400 days | [Downloading artifacts][artifacts-dl], [retention] |
| Caches | "Anyone with read access can create a pull request on a repository and access the contents of a cache." Fork PRs "can … access caches on the base branch" | Evicted when not accessed for 7 days. 10 GB per repo by default | [Dependency caching][cache] |

**(inference)** On a public repo, every signed-in user has read access. So on
`AjinkyaK/hem`, logs and artifacts are effectively **public to any GitHub
account**, and caches are readable by anyone who opens a PR. Anything an
Applicant run prints, uploads or caches there would leak for up to 90 days.
On a private repo, the same surfaces are limited to the owner and
collaborators.

GitHub itself advises against storing sensitive data in caches: "We recommend
that you don't store any sensitive information, such as access tokens or login
credentials" ([cache]).

### Secrets

- Size and count: "Secrets are limited to 48 KB in size." There are up to 100
  repository secrets and 100 environment secrets
  ([Secrets reference][secrets-ref]).
- Redaction is best-effort. GitHub redacts registered secrets and some known
  token shapes, and warns: "avoid using structured data as the values of
  secrets" ([secrets-ref]). A secret that is transformed (Base64,
  URL-encoded, and so on) must be registered too. Any other sensitive value can
  be masked with `::add-mask::VALUE` ([secure]).
- "Secrets are not automatically passed to reusable workflows." With the
  exception of `GITHUB_TOKEN`, "secrets are not passed to the runner when a
  workflow is triggered from a forked repository"
  ([Using secrets][secrets-how]).
- Large files can be committed encrypted (for example with gpg), with only the
  passphrase stored as a secret. GitHub notes that it "does not redact secrets
  that are printed in logs" in that workaround ([secrets-how]). Base64 in a
  secret "is not a substitute for actual encryption" ([secrets-how]).

### How Hem's private inputs get in

- `ANTHROPIC_API_KEY` is a **repository secret on the private workspace**,
  passed explicitly to the reusable workflow
  (`secrets: { ANTHROPIC_API_KEY: ... }`).
- **Base Resume and targeting notes are plain files in the private workspace
  repo**, fetched with `actions/checkout`. Inside a reusable workflow, "the
  `github` context is always associated with the caller workflow"
  ([Reusing workflow configurations][reuse-ref]). **(inference)** So a default
  `actions/checkout` in the called workflow checks out the *workspace*, not
  `hem`.
- Putting the resume into a secret is unnecessary in a private repo. It also
  hits the 48 KB limit and the structured-data redaction caveat.
- Neither the resume nor the notes should be printed to logs, or put in a
  cache. The repo is private, but logs and caches are still the
  widest-retained, least-reviewed surfaces.

## 3. A private repo running a public engine

### Can a private repo use a public repo's workflow or image?

- **Reusable workflow.** It is callable when "the called workflow is stored in
  a public repository, and your organization allows you to use public reusable
  workflows". Private callers can call public and private workflows. Public
  callers can call only public ones ([reuse-ref]).
- **Image.** "You can also access public container images anonymously"
  ([Working with the Container registry][ghcr]). A private workspace can pull a
  public `ghcr.io/ajinkyak/hem` image with no credentials.
- **GHCR gotcha.** "When you first publish a package, the default visibility is
  private" ([ghcr]). The Hem image must be switched to public once. Add the
  `org.opencontainers.image.source` label to link it to the repo, because a
  pushed image "is not linked to a repository by default" ([ghcr]). Publishing
  from `hem`'s CI can use `GITHUB_TOKEN` ([ghcr]).

### The options

| Option | How it looks in the workspace | Pros | Cons |
|---|---|---|---|
| **A. Public reusable workflow wrapping a public image** | `jobs.tailor.uses: AjinkyaK/hem/.github/workflows/tailor.yml@<sha-or-tag>`, with `with:` inputs and `secrets:` | Hem owns every step: checkout, run, commit, PR. The workspace file is about 10 lines. An upgrade is a ref bump. The run lives in the caller's repo | Job-level only: "called directly within a job, and not from within a job step". Caller `env` is "not propagated" ([reuse-ref]). Max 10 nesting levels, 50 reusable workflows per file ([reuse-ref]) |
| **B. `container:` job in the workspace** | `jobs.tailor.container: ghcr.io/ajinkyak/hem@sha256:…`, then `run: hem …` steps | Simple. The workspace sees exactly what runs | Every workspace duplicates the glue steps. `run` steps default to `sh` not `bash`, and `--entrypoint`/`--network` options are unsupported ([Run jobs in a container][container]) |
| **C. Docker container action** | `steps: - uses: AjinkyaK/hem@<ref>` with `action.yml` `runs.using: docker`, `image: docker://ghcr.io/…` | Step-level, so it composes with the workspace's own steps. Inputs arrive as `INPUT_<NAME>` env and `args` ([Metadata syntax][metadata]) | Linux runners only. Docker actions are "slower than JavaScript actions" because of "the latency to build and retrieve the container" ([Custom actions][custom]). Pointing `image` at a `Dockerfile` rebuilds it, **(inference)** |
| **D. `docker://` step** | `steps: - uses: docker://ghcr.io/ajinkyak/hem:<tag>` ([syntax]) | No action repo needed | No declared inputs. Arguments are passed raw, so this suits ad hoc use only |

Shared mechanics:

- The job-level `container` accepts a Docker Hub name or a registry name.
  Private registries take `credentials: {username, password}`, "the same values
  that you would provide to the `docker login` command" ([container],
  [syntax]).
- The called workflow receives `github.token`, and its permissions "can be only
  downgraded (not elevated) by the called workflow" ([reuse-ref]). **(inference)**
  Because `github` is the caller's context, that token is scoped to the
  workspace repo. It can push the branch and open the PR there, and it cannot
  touch `hem`.
- Pin references: "Pin references to actions to a commit SHA" ([secure]).
  Images can be pulled "by the `digest` SHA value" ([ghcr]). The workspace
  should pin the reusable workflow by SHA or tag, and the reusable workflow
  should pin the image by digest.

## 4. Getting the result back

| Channel | Privacy on a private workspace | Retention | Notes |
|---|---|---|---|
| **Commit to a branch plus a PR** | Repo collaborators only | Permanent until deleted | Reviewable diff of the Tailored Resume. Needs `contents: write` and `pull-requests: write` on `GITHUB_TOKEN`. Grant the minimum ([secure]). A PR opened with `GITHUB_TOKEN` won't trigger other workflows ([events]) |
| **Uploaded artifact** | Read access needed ([artifacts-dl]) | 90 days by default, 1–400 on private ([retention]). Deleted with the run ([Workflow artifacts][artifacts]) | Counts against the 500 MB Free storage, shared with Packages ([billing]) |
| **Issue comment** | Collaborators only | Permanent | Good for status ("tailored, see PR #n"). Poor for a document |
| **Release** | Same as repo visibility **(inference)** | Permanent | Overkill: releases are for versioned deliverables |
| **Job summary or logs** | Read access | 90 days by default | Never put resume content here |

**(inference)** On the public `hem` repo, every channel above would be world
readable. That is another reason the run must belong to the private workspace.

## 5. Limits and cost

- **Job time:** "Each job in a workflow can run for up to 6 hours of execution
  time" ([Limits][limits]). `timeout-minutes` defaults to 360 ([syntax]). A
  workflow run is capped at 35 days, including waiting and approval
  ([limits]).
- **Concurrency (Free):** 20 concurrent standard hosted jobs ([limits]).
- **`GITHUB_TOKEN` API rate:** 1,000 requests per hour per repository
  ([limits]).
- **Minutes:** "The use of standard GitHub-hosted runners is free … in public
  repositories" ([Actions billing][billing]). GitHub Free personal accounts get
  "$12 USD of included compute usage per month". Pro gets $18
  ([GitHub's plans][plans]). Linux 2-core x64 is $0.006/min, arm64 $0.005/min,
  and 1-core x64 $0.002/min ([billing]). **(inference)** $12 is about 2,000
  Linux 2-core minutes, or about 6,000 on 1-core. A run of a few minutes allows
  hundreds of tailorings a month. A Hem run is mostly waiting on the LLM, so
  the 1-core runner is likely enough.
- **Storage:** artifacts get 500 MB on Free, shared with Packages
  ([billing], [plans]). Caches get 10 GB per repo ([limits]).
- **Image:** "GitHub Packages usage is free for public packages."
  "Container image storage and bandwidth for the Container registry is
  currently free", with at least a month's notice before that changes. Downloads
  from Actions using `GITHUB_TOKEN` don't count against transfer
  ([Packages billing][pkg-billing]). The GHCR layer limit is 10 GB, and uploads
  time out after 10 minutes ([ghcr]).
- **Build versus pull:** **(inference)** Build the image once, in `hem`'s
  public CI, which costs no minutes, and push it to GHCR. Each workspace run
  then only pulls. Building per run (a Dockerfile-backed action, or
  `docker build` in the workspace) spends the Applicant's private minutes on
  every tailoring, and adds the build latency GitHub calls out ([custom]).
- **Not verified:** what happens on GitHub Free when the $12 allowance runs
  out (blocked, or billed). The [budgets page][budgets] covers "stop usage"
  budgets for organizations, but doesn't state the personal Free default.

## Recommendation for Hem

**Option A: a public reusable workflow in `hem`, wrapping a public,
digest-pinned GHCR image. It is called from a thin private workspace repo,
triggered by `workflow_dispatch`, and delivers by branch plus PR.**

- **Privacy holds structurally.** The run, logs, artifacts and token all belong
  to the private caller ([reuse-ref]). `hem` holds only code, the workflow
  definition, and the image. Hem's own CI must use fixture data only, because
  anything it logs is effectively public.
- **The engine owns its behaviour.** Checkout, invocation, commit and PR are
  defined once in `hem`. Workspaces don't drift, and an upgrade is one ref
  bump.
- **Cheap and fast.** Public CI builds the image for free. Workspaces pull it
  anonymously, and GHCR costs nothing.
- **The output fits the review loop.** A PR with the Tailored Resume diff is
  private, permanent, and reviewable.

Sketch of the workspace side:

```yaml
# workspace/.github/workflows/tailor.yml  (private repo)
on:
  workflow_dispatch:
    inputs:
      job_posting: { type: string, required: true, description: URL or pasted text }
permissions: { contents: write, pull-requests: write }
jobs:
  tailor:
    uses: AjinkyaK/hem/.github/workflows/tailor.yml@<sha>
    with: { job_posting: "${{ inputs.job_posting }}" }
    secrets: { ANTHROPIC_API_KEY: "${{ secrets.ANTHROPIC_API_KEY }}" }
```

The `hem` side would be `on: workflow_call` with a job on
`container: ghcr.io/ajinkyak/hem@sha256:…`. Its steps would be
`actions/checkout` (the workspace), then `hem` reading the posting from an env
var (not `${{ }}` interpolation), then commit to a new branch and `gh pr
create`.

Open follow-ups for the PRD: an issue-driven trigger inside the workspace;
whether `secrets: inherit` works across personal accounts (the how-to says it
applies within the same organization or enterprise, so pass secrets
explicitly); and the Free-tier overage behaviour.

[events]: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
[syntax]: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
[rest-wd]: https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event
[rest-rd]: https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event
[secure]: https://docs.github.com/en/actions/reference/security/secure-use
[logs]: https://docs.github.com/en/actions/how-tos/monitor-workflows/use-workflow-run-logs
[artifacts-dl]: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts
[artifacts]: https://docs.github.com/en/actions/concepts/workflows-and-actions/workflow-artifacts
[retention]: https://docs.github.com/en/organizations/managing-organization-settings/configuring-the-retention-period-for-github-actions-artifacts-and-logs-in-your-organization
[cache]: https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching
[secrets-ref]: https://docs.github.com/en/actions/reference/security/secrets
[secrets-how]: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets
[reuse-ref]: https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations
[ghcr]: https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry
[container]: https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/run-jobs-in-a-container
[metadata]: https://docs.github.com/en/actions/reference/workflows-and-actions/metadata-syntax
[custom]: https://docs.github.com/en/actions/concepts/workflows-and-actions/custom-actions
[limits]: https://docs.github.com/en/actions/reference/limits
[billing]: https://docs.github.com/en/billing/concepts/product-billing/github-actions
[plans]: https://docs.github.com/en/get-started/learning-about-github/githubs-plans
[pkg-billing]: https://docs.github.com/en/billing/concepts/product-billing/github-packages
[budgets]: https://docs.github.com/en/billing/how-tos/set-up-budgets
