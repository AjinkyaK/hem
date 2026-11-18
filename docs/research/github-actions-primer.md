# Learning GitHub Actions, reusable workflows and GHCR

Research for [#39](https://github.com/AjinkyaK/hem/issues/39), part of the
autonomous Hem PRD map ([#27](https://github.com/AjinkyaK/hem/issues/27)). It
builds on [#28](https://github.com/AjinkyaK/hem/issues/28), which chose the
shape for Phase 3. In that shape a **public reusable workflow** in `hem` runs a
**public GHCR image**. A **private Workspace repo** calls it, and the result
comes back as a branch plus a PR in that Workspace.

This is a beginner's guide. It assumes you have used git and GitHub, but not
GitHub Actions, containers, or GHCR. Every term is explained the first time it
appears, and every YAML snippet is cut down to the lines that matter.

Sources are GitHub Docs, Docker Docs, git docs and the GitHub changelog, read
on 2026-11-17. Each claim links to the page that states it. Two markers are
used:

- **(inference)** marks a conclusion drawn from the cited facts that the docs
  don't state outright.
- **(unverified)** marks a claim with no primary source found. Check it before
  relying on it.

## Answer in brief

- A **workflow** is a YAML file in `.github/workflows/`. An **event** starts
  it. It holds **jobs**, and each job is a list of **steps** that run on one
  fresh virtual machine, called a **runner**. `workflow_dispatch` gives a
  workflow a "Run workflow" button with typed input fields.
- Every job gets a short-lived **`GITHUB_TOKEN`**. It can act only on the repo
  whose workflow is running, and only with the `permissions:` you grant it.
  **Secrets** are encrypted values (such as `ANTHROPIC_API_KEY`) stored in repo
  settings and read as `${{ secrets.NAME }}`.
- A **reusable workflow** (`on: workflow_call`) is a workflow that another
  workflow calls like a function: `uses: owner/repo/.github/workflows/x.yml@ref`.
  GitHub fetches **only that YAML file**, at that ref. The run, logs, billing and
  `GITHUB_TOKEN` all belong to the **caller**, which for Hem is the private
  Workspace.
- An **image** is a frozen, read-only bundle of files and programs. A
  **container** is a running copy of an image. A **registry** stores images,
  and **GHCR** (`ghcr.io`) is GitHub's registry. With `container:`, every step
  of a job runs inside the image.
- There are three kinds of name, and they differ in whether they can change:
  - A **git tag** (`v0.3.0`) can be moved, unless it belongs to an
    **immutable release**, a GitHub feature that has been generally available
    since October 2025.
  - An **image tag** (`:v0.3.0`) can always be moved on GHCR. GHCR has **no
    immutable-tag feature today**.
  - An **image digest** (`@sha256:…`) is the hash of the image's content, so
    it can never point at different content.
- **Pinning trade-off.** Pinning the image by tag is simple but trusts that
  nobody re-pushes the tag. Pinning by digest is exact, but the digest is only
  known after the build. A release must therefore write it into the workflow
  file *after* building the image and *before* tagging. `GITHUB_TOKEN` cannot
  push changes to workflow files, so that write needs a PR, a PAT, or a GitHub
  App token.
- **Name clash.** GitHub's `GITHUB_WORKSPACE` is a temporary folder on the
  runner where a job's files are checked out. It is wiped when the job ends.
  Hem's **Workspace** is the Applicant's durable directory, which in Phase 3 is
  a private repo. During a run, the Workspace repo is checked out *into*
  `GITHUB_WORKSPACE`, but the two are not the same thing.
- **Recommendation:**
  - The Workspace pins `uses:` by **full commit SHA plus a `# v0.3.0`
    comment**, and Dependabot bumps both.
  - `hem` pins the image by **digest**, written in by a small release PR.
  - Releases are **immutable releases**.

## 1. GitHub Actions basics

### The vocabulary

| Term | What it is ([Understand GitHub Actions][understand]) |
|---|---|
| **Workflow** | "A configurable automated process that will run one or more jobs." It is a YAML file in `.github/workflows/`. |
| **Event** | "A specific activity in a repository that triggers a workflow run", such as a push, a PR, or a button click. |
| **Job** | "A set of steps in a workflow that is executed on the same runner." Jobs run in parallel unless one `needs:` another. |
| **Step** | "Either a shell script that will be executed, or an action that will be run." |
| **Action** | A packaged, reusable step, such as `actions/checkout`, used with `uses:`. |
| **Runner** | "A server that runs your workflows when they're triggered." GitHub-hosted runners are fresh virtual machines, thrown away after the job. |

A minimal workflow:

```yaml
# .github/workflows/hello.yml
name: Hello
on: push                      # the event
jobs:
  greet:                      # a job id (any name)
    runs-on: ubuntu-latest    # which kind of runner
    steps:
      - uses: actions/checkout@v5   # a step that runs an action
      - run: echo "Hello from $GITHUB_WORKSPACE"   # a step that runs a shell command
```

### `workflow_dispatch`: a "Run workflow" button with inputs

`on: workflow_dispatch` adds a **Run workflow** button to the repo's Actions
tab. You can also fire it with `gh workflow run` or the REST API. `inputs`
become form fields. Each input is typed (`string`, `boolean`, `choice`,
`number` or `environment`), and there are limits of 25 inputs and 65,535
characters in total ([workflow syntax][syntax], [events][events]). The button
appears only once the workflow file is on the **default branch** ([events]).

```yaml
on:
  workflow_dispatch:
    inputs:
      job_posting:
        description: Job Posting URL or pasted text
        type: string
        required: true
jobs:
  show:
    runs-on: ubuntu-latest
    steps:
      - env:
          JOB_POSTING: ${{ inputs.job_posting }}   # pass via env, never inline in run:
        run: echo "Got ${#JOB_POSTING} characters"
```

`${{ … }}` is an **expression**. GitHub replaces it with a value *before* the
shell sees the script. Putting untrusted text directly into `run:` this way
allows script injection. GitHub's advice is to route it through an environment
variable, as above ([Secure use][secure]).

### `GITHUB_TOKEN` and `permissions:`

- GitHub creates a `GITHUB_TOKEN` for each job. It "expires when the job
  finishes", or after at most 6 h on hosted runners. "The token's permissions
  are limited to the repository that contains your workflow"
  ([GITHUB_TOKEN][token]).
- For a repo in a personal account, the default is restricted: "`GITHUB_TOKEN`
  only has read access for the `contents` and `packages` scopes"
  ([Actions settings][settings]).
- You raise or lower access with `permissions:`, either at the top level or per
  job ([workflow syntax][syntax]):

  ```yaml
  permissions:
    contents: write        # push commits and branches, create releases
    pull-requests: write   # open PRs
    packages: write        # push images to GHCR
  ```

- **Opening PRs needs one more switch.** For personal-account repos, by default
  "workflows are not allowed to create or approve pull requests". Turn on
  *Settings → Actions → General → Allow GitHub Actions to create and approve
  pull requests* ([Actions settings][settings]). The Workspace repo needs this.
- Events caused by `GITHUB_TOKEN` (for example, a PR it opens) do not trigger
  other workflows, except `workflow_dispatch` and `repository_dispatch`
  ([GITHUB_TOKEN][token]).
- There is **no `workflows` permission** in the `GITHUB_TOKEN` permission list
  ([workflow syntax][syntax]). Section 4 covers why that matters.

### Repo secrets

A secret is an encrypted value stored under *Settings → Secrets and variables →
Actions* and read as `${{ secrets.ANTHROPIC_API_KEY }}`. Secrets are capped at
48 KB, and logs redact them on a best-effort basis
([Secrets reference][secrets-ref]). "Secrets are not automatically passed to
reusable workflows" ([Using secrets][secrets-how]), so the caller hands them
over explicitly (see below).

## 2. Reusable workflows

A reusable workflow is a workflow that another workflow can call, like a
function. The **called** workflow declares `on: workflow_call`, along with the
inputs and secrets it accepts. The **caller** uses it as a whole job.

```yaml
# Called workflow: AjinkyaK/hem/.github/workflows/tailor.yml  (public)
on:
  workflow_call:
    inputs:
      job_posting: { type: string, required: true }   # boolean, number or string
    secrets:
      ANTHROPIC_API_KEY: { required: true }
jobs:
  tailor:
    runs-on: ubuntu-latest
    steps:
      - run: echo "tailoring…"
```

```yaml
# Caller: the private Workspace repo, .github/workflows/tailor.yml
on: workflow_dispatch
jobs:
  tailor:
    uses: AjinkyaK/hem/.github/workflows/tailor.yml@v0.3.0   # a whole job, no steps:
    with:    { job_posting: "${{ inputs.job_posting }}" }
    secrets: { ANTHROPIC_API_KEY: "${{ secrets.ANTHROPIC_API_KEY }}" }
```

### What `uses: owner/repo/.github/workflows/x.yml@ref` fetches

- The format is `{owner}/{repo}/.github/workflows/{filename}@{ref}`. "The
  `{ref}` can be a SHA, a release tag, or a branch name." If a tag and a branch
  share a name, "the release tag takes precedence". GitHub recommends a commit
  SHA "for stability and security" ([Reuse workflows][reuse-how]).
- GitHub resolves the ref to a commit when the run starts. Re-running *failed*
  jobs "uses the workflow from the first attempt's commit SHA", while re-running
  *all* jobs re-resolves the ref ([Reusable workflows reference][reuse-ref]).
- **(inference)** Only the YAML file is read from `hem`. No `hem` source code
  lands on the runner unless a step checks it out or, as in Hem's case, the
  code ships inside the image. That is why the image matters: the reusable
  workflow is the *instructions*, and the image is the *program*.
- A reusable workflow is called "directly within a job, and not from within a
  job step". The caller's workflow-level `env` is "not propagated". You can nest
  up to ten levels, and call at most 50 reusable workflows per file
  ([reuse-ref]).
- Inputs to `workflow_call` are `boolean`, `number` or `string`. Outputs must
  be mapped from job outputs ([reuse-how]).
- `secrets: inherit` passes all the caller's secrets, but only when the called
  workflow is in the same organization or enterprise ([reuse-how]). Hem
  (personal accounts) must pass secrets one by one.

### Whose repo, permissions, logs and token

| Thing | Belongs to | Source |
|---|---|---|
| `github` context (`github.repository`, `github.sha`, …) | **Caller.** It "is always associated with the caller workflow" | [reuse-ref] |
| `GITHUB_TOKEN` | **Caller's** token. Its permissions "can be only downgraded (not elevated) by the called workflow" | [reuse-ref] |
| Billing for hosted runners | **Caller.** It "is always associated with the caller" | [reuse-ref] |
| Run page and logs | **Caller's** Actions tab **(inference** from the above; the docs don't say it outright) | — |
| Default `actions/checkout` target | **Caller's** repo, because it reads `github.repository` **(inference)** | [reuse-ref] |

So when the Workspace calls `hem`'s workflow, everything happens "in" the
Workspace. The token can push to the Workspace, and cannot touch `hem`.

**How does the called workflow know its own version?** Since August 2026 the
`job` context has `job.workflow_ref`, `job.workflow_sha`,
`job.workflow_repository` and `job.workflow_file_path`. These describe "the
workflow file that defines the current job", so inside `tailor.yml` they point
at `hem`, not the caller ([changelog Aug 2026][job-ctx-changelog],
[contexts][contexts]). Before that, the only way was the OIDC token's
`job_workflow_ref` claim ([OIDC with reusable workflows][oidc-reuse]). One
catch: `jobs.<id>.container.image` may use only the `github`, `needs`,
`strategy`, `matrix`, `vars` and `inputs` contexts, **not `job`**
([contexts]). So you can't write `image: …:${{ job.workflow_ref }}` directly.

## 3. Containers, registries and GHCR

| Term | Plain meaning |
|---|---|
| **Image** | A packaged bundle of "everything a container needs to run": files, binaries, libraries, config. "Images are immutable": once built, "it can't be modified", only replaced by a new one. It is built in stacked **layers** ([Docker: what is an image][docker-image]). |
| **Container** | A running, isolated process started *from* an image. If the image is a recipe card, the container is the dish ([docker-image]). |
| **Registry** | A server that stores and serves images, for example Docker Hub (`docker.io`) or GHCR. |
| **Image reference** | `[HOST/]NAMESPACE/REPOSITORY[:TAG]`, for example `ghcr.io/ajinkyak/hem:v0.3.0`. With no tag given, Docker uses `latest` ([docker tag][docker-tag]). |
| **GHCR** | GitHub Container Registry at `ghcr.io`. Images live under your account as **packages**. |

### Running a job inside an image

```yaml
jobs:
  tailor:
    runs-on: ubuntu-latest
    container:
      image: ghcr.io/ajinkyak/hem@sha256:4f2c…   # every step below runs inside this
    steps:
      - run: hem --version
```

- `jobs.<id>.container` creates a container "to run any steps in a job that
  don't already specify a container" ([Run jobs in a container][container]).
- "If your workflows use … job containers … then you must use a Linux runner"
  ([workflow syntax][syntax]).
- Inside a container, `run:` defaults to `sh`, not `bash` ([container]).
- Private images need `credentials:` (the values you'd give `docker login`)
  ([container]).
- **(inference)** Because *every* step runs in the image, the image must also
  contain whatever the later steps call: `git` and `gh` for the commit-and-PR
  steps, and a libc that the runner's Node.js works with for JavaScript actions
  like `actions/checkout`. **(unverified)** Alpine-based images are commonly
  reported to break JavaScript actions, so a Debian-based image such as
  `python:3.x-slim` is the safer base.

### Public versus private packages on GHCR

- "When you first publish a package, the default visibility is private." Switch
  it to public once in the package settings ([GHCR][ghcr]).
- "You can also access public container images anonymously" ([ghcr]). A
  Workspace can pull a public Hem image with no credentials. A private image
  would need the Workspace to be granted access, or a token.
- Link the package to its repo with the `org.opencontainers.image.source` label
  ([ghcr]). Dependabot also reads this label for release notes
  ([Dependabot ecosystems][dependabot-eco]).
- `hem`'s CI pushes with its own `GITHUB_TOKEN` and `packages: write` ([ghcr]).
  A minimal build-and-push job using Docker's official action, whose outputs
  include `digest` ([docker/build-push-action][bpa]):

  ```yaml
  permissions: { contents: read, packages: write }
  steps:
    - uses: actions/checkout@v5
    - uses: docker/login-action@v4
      with: { registry: ghcr.io, username: "${{ github.actor }}", password: "${{ secrets.GITHUB_TOKEN }}" }
    - uses: docker/build-push-action@v7
      id: build
      with: { push: true, tags: "ghcr.io/ajinkyak/hem:sha-${{ github.sha }}" }
    - run: echo "digest=${{ steps.build.outputs.digest }}" >> "$GITHUB_STEP_SUMMARY"
  ```

- GHCR storage and bandwidth are currently free, and public packages are free
  ([Packages billing][pkg-billing], as cited in #28).

## 4. Versioning and pinning

### Three kinds of name, and which can change

| Name | Example | Can it later point at something else? |
|---|---|---|
| **Git tag** | `v0.3.0` → a commit | **Yes**, by force-push (`git tag -f`, "Replace an existing tag") ([git-tag][git-tag]), **unless** it belongs to an **immutable release** (below), or a tag **ruleset** blocks updates ([rulesets][rulesets]). |
| **Image tag** | `ghcr.io/ajinkyak/hem:v0.3.0` | **Yes, always, on GHCR.** Pushing again with the same tag re-points it. The GHCR docs describe no tag-immutability setting ([ghcr]). |
| **Image digest** | `ghcr.io/ajinkyak/hem@sha256:2e86…` | **No.** It is the SHA-256 of the content. Docker calls it the "immutable identifier", and pulling by digest lets you "'pin' an image to that version" ([docker pull][docker-pull]). |
| **Commit SHA** | `@a1b2c3…` (40 hex chars) | **No.** It is the hash of the commit. This is why GitHub says "pin references to actions to a commit SHA" ([secure]). |

Git itself warns that re-pointing a published tag "is a big security issue, in
that people MUST be able to trust their tag-names" ([git-tag]). **(inference)**
GitHub resolves the `uses:` ref afresh at every run start, so a moved tag takes
effect on the very next run.

A digest can't change, but it can **disappear**. An owner can delete a package
version, and restore it within 30 days. Public versions with over 5,000
downloads can't be deleted ([Deleting packages][pkg-delete]). If that happens,
a digest pin fails loudly instead of silently running something else.

### Immutable releases (GitHub, today)

- Generally available since **2025-10-28**. "Tags for new immutable releases
  are protected and can't be deleted or moved", and their assets "can't be
  added, modified, or deleted" ([changelog][immut-ga]).
- After you delete such a release you can delete the tag, but "you cannot reuse
  the same tag name" ([Immutable releases][immut]). A pinned `@v0.3.0` can
  break, but it can never be swapped.
- To turn it on: repo *Settings → Releases → Enable release immutability*.
  "Immutability will only apply to future releases" ([Preventing changes to
  releases][immut-how]).
- It protects **git tags that have a release**. A bare tag with no release, or a
  floating `v0` tag you keep moving, is not protected. **(inference)**
- **(unverified)** The docs pages read didn't state which plans include it. The
  setting is described for any repository, and the changelog doesn't restrict
  it.

### Immutable image tags (GHCR, today): not available

- The [GHCR docs][ghcr] have no tag-immutability setting.
- A December 2025 community feature request for "immutable image tags in
  container registry" is still unanswered by staff. A user there wrote in
  September 2026: "On GHCR there's no way to do the same thing, a pushed tag
  can always be retargeted" ([community #181783][ghcr-immut-ask]).
- By contrast, Docker Hub ([immutable tags][dockerhub-immut]) and GitLab offer
  immutable tags.
- **(unverified)** That GHCR lacks the feature is an absence of evidence, not a
  documented "no". Treat GHCR image tags as movable.

### Keeping the workflow version and the image version in step

In Hem the two travel together. The workflow says *how* to run, and the image
is *what* runs. One version number, say `v0.3.0`, should name both:

```text
git tag v0.3.0 (immutable release)
  └─ commit whose tailor.yml says:  image: ghcr.io/ajinkyak/hem@sha256:D   # v0.3.0
                                                         │
GHCR:  ghcr.io/ajinkyak/hem:v0.3.0  ────────────────────►  digest D
```

The Workspace pins only the first line. Everything else follows from it.

### Tag pinning versus digest pinning (for the image inside `tailor.yml`)

| | `image: ghcr.io/ajinkyak/hem:v0.3.0` (tag) | `image: ghcr.io/ajinkyak/hem@sha256:D` (digest) |
|---|---|---|
| Release steps | Build, push `:v0.3.0`, and tag the same commit. One step, no file edits | Build, push, **write D into `tailor.yml`**, commit, then tag that commit |
| What `@v0.3.0` guarantees | The *workflow* is fixed (with an immutable release), but the *image* is whatever `:v0.3.0` points at today | Workflow **and** image fixed. The release tag is a complete snapshot |
| Failure mode | A re-push of `:v0.3.0`, by a mistake or a compromised CI token, silently changes every Workspace's next run | None silent. A deleted version fails loudly |
| Readability | Clear | Opaque hash. Add a `# v0.3.0` comment |

**The chicken-and-egg.** The digest is a hash of the built image, so it only
exists *after* the build. The workflow file lives in the same repo, so writing
the digest into it makes a **new commit**. The release tag therefore has to go
on that later commit, and the image was built from its parent. That is fine,
because the two commits differ only in `tailor.yml`. **(inference)** Keep
`.github/` out of the image with `.dockerignore`, so "built from the parent"
and "built from the tagged commit" mean the same content. It is an ordering
problem, not a true loop: build, then write, then tag.

**The extra gotcha: `GITHUB_TOKEN` can't edit workflow files.** The token's
permission list has no `workflows` entry ([workflow syntax][syntax]).
**(unverified, but widely reported)** Pushes from `GITHUB_TOKEN` that change
files under `.github/workflows/` are rejected with "refusing to allow a GitHub
App to create or update workflow … without `workflows` permission". So a fully
automatic "write the digest and tag" job needs a PAT or a GitHub App token with
workflow access. Without one, the write must go through a normal PR. Three
ways to do the release:

1. **Release PR (simplest, no extra credentials).** CI on `main` pushes
   `:sha-<commit>` and prints the digest. You, or an agent on your machine, open
   a PR changing the one `image:` line. Squash-merge it, then publish an
   immutable GitHub Release `v0.3.0` on the merge commit. An `on: release`
   workflow can add the `:v0.3.0` image tag to the same digest without
   rebuilding. **(unverified)** Use `docker buildx imagetools create` for this.
   This fits `hem`'s "PRs only, never push to `main`" ruleset.
2. **Automated with a GitHub App token.** A `workflow_dispatch` release
   workflow builds, rewrites `tailor.yml`, commits on top of `main` *without
   pushing `main`*, and pushes only the tag plus an immutable release. This is
   fewer clicks, but adds an App or PAT to manage.
3. **Digest in a non-workflow file.** Keep the digest in, for example,
   `release/image-digest`. A first job checks out `hem` at `job.workflow_sha`,
   reads the file, and outputs it. The main job uses
   `container: { image: "${{ needs.resolve.outputs.image }}" }`, which is
   allowed because `needs` is available there ([contexts]). This avoids editing
   workflow files, but adds a job to every run, and the image is no longer
   visible in the YAML.

### Dependabot bumping the `uses:` ref

In the Workspace repo, `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: github-actions
    directory: "/"          # must be "/" to scan .github/workflows
    schedule: { interval: weekly }
```

- Dependabot keeps "reusable workflows used inside workflows … up to date"
  ([Auto-update actions][dependabot-actions]). It has supported versioned
  reusable workflows since 2023 ([changelog 2023][dependabot-reuse]).
- It handles both tags and SHAs. When a SHA pin carries a version comment on
  the same line, it "updates the version documentation" too
  ([Dependabot ecosystems][dependabot-eco]). So
  `uses: AjinkyaK/hem/.github/workflows/tailor.yml@a1b2c3… # v0.3.0` becomes a
  PR bumping both.
- Dependabot's Docker support covers Dockerfiles, Kubernetes manifests, Helm
  and Compose ([dependabot-eco]). **(inference)** It does not cover a
  `container: image:` line inside a workflow file, which is one more reason
  `hem` writes its own digest.

## 5. Name clash: `GITHUB_WORKSPACE` versus Hem's Workspace

| | GitHub's workspace | Hem's **Workspace** ([GLOSSARY.md](../../GLOSSARY.md)) |
|---|---|---|
| What | `GITHUB_WORKSPACE` / `${{ github.workspace }}`: "the default working directory on the runner for steps, and the default location of your repository when using the checkout action" ([Variables][variables], [contexts]) | "The Applicant's own directory, kept outside Hem, that holds their Portfolio, Brief, and the Resume Drafts and Resumes produced from them" |
| Lifetime | One job. A temp folder on a throwaway runner, for example `/home/runner/work/repo/repo` ([variables]) | Durable. In Phase 3, a private git repo |
| Owner | The runner | The Applicant |

During a Hem run, `actions/checkout` copies the Workspace repo **into**
`$GITHUB_WORKSPACE`. So for the length of one job, that folder *holds* a
working copy of the Workspace. Writing files there changes nothing permanent
until the run commits and pushes them. **(unverified)** In a `container:` job,
the runner mounts its work folder into the container, commonly at `/__w/…`, so
the value of `GITHUB_WORKSPACE` inside the container differs from the host
path. Always read the variable; never hard-code the path.

To keep the words apart:

- In prose, call GitHub's folder "the runner's checkout folder" or write
  `GITHUB_WORKSPACE` in code font. Keep the bare capitalised **Workspace** for
  Hem's meaning.
- Call the private repo "the Workspace repo" (it *is* the Workspace, hosted on
  GitHub). Pass the folder to Hem explicitly, for example
  `hem tailor --workspace "$GITHUB_WORKSPACE"`.
- Don't name a workflow input or job `workspace`. That invites mixing it up with
  the `github.workspace` context.

## 6. Walk-through: one Hem run, end to end

**Setup, done once.**

- *Workspace repo* (private, for example `ajinkyak/hem-workspace`) holds:
  `portfolio.md`, `brief.md`, `resumes/`, a `.github/workflows/tailor.yml`
  caller, `.github/dependabot.yml`, and an `ANTHROPIC_API_KEY` repo secret. In
  *Settings → Actions → General*, "Allow GitHub Actions to create and approve
  pull requests" is on.
- *`hem` repo* (public) holds the reusable `.github/workflows/tailor.yml` and a
  CI workflow that builds and pushes the image. Its GHCR package is set to
  public, and immutable releases are enabled.

**Caller (in the Workspace):**

```yaml
name: Tailor
on:
  workflow_dispatch:
    inputs:
      job_posting: { type: string, required: true, description: URL or pasted text }
jobs:
  tailor:
    permissions: { contents: write, pull-requests: write }   # the ceiling for the called workflow
    uses: AjinkyaK/hem/.github/workflows/tailor.yml@a1b2c3d4e5f6…  # v0.3.0
    with:    { job_posting: "${{ inputs.job_posting }}" }
    secrets: { ANTHROPIC_API_KEY: "${{ secrets.ANTHROPIC_API_KEY }}" }
```

**Called (in `hem`), sketch:**

```yaml
on:
  workflow_call:
    inputs:  { job_posting: { type: string, required: true } }
    secrets: { ANTHROPIC_API_KEY: { required: true } }
jobs:
  tailor:
    runs-on: ubuntu-latest
    permissions: { contents: write, pull-requests: write }
    container:
      image: ghcr.io/ajinkyak/hem@sha256:4f2c…   # v0.3.0, written by the release PR
    steps:
      - uses: actions/checkout@<sha>            # checks out the CALLER: the Workspace repo
      - name: Tailor
        env:
          JOB_POSTING: ${{ inputs.job_posting }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: hem tailor --workspace "$GITHUB_WORKSPACE"   # reads JOB_POSTING from env
      - name: Branch, commit, PR
        env: { GH_TOKEN: "${{ github.token }}" }
        run: |
          git switch -c "hem/run-${{ github.run_id }}"
          git add resumes/
          git -c user.name=hem-bot -c user.email=hem-bot@users.noreply.github.com commit -m "Resume Draft for run ${{ github.run_id }}"
          git push -u origin HEAD
          gh pr create --fill
```

(The `hem tailor` flags are placeholders. The CLI is not designed yet.)

**What happens when you click "Run workflow":**

1. **Click.** In the Workspace repo: *Actions → Tailor → Run workflow*. Paste
   the Job Posting into the `job_posting` box, then click **Run workflow**. This
   fires a `workflow_dispatch` event in the **Workspace** ([events]).
2. **Resolve.** GitHub reads the caller file, sees
   `uses: AjinkyaK/hem/…/tailor.yml@a1b2c3…`, and fetches **that one YAML
   file** from the public `hem` repo at that commit ([reuse-how]). That is
   allowed because a private caller may call a public reusable workflow
   ([reuse-ref]).
3. **Runner.** GitHub starts a fresh Ubuntu runner, billed to the Workspace's
   account ([reuse-ref]). It mints a `GITHUB_TOKEN` for the **Workspace** repo,
   capped at `contents: write` and `pull-requests: write` ([token], [reuse-ref]).
4. **Pull image.** The runner pulls `ghcr.io/ajinkyak/hem@sha256:4f2c…`
   anonymously, because the package is public ([ghcr]). It starts a container
   from it. The digest guarantees these are exactly the bytes released as
   `v0.3.0` ([docker-pull]).
5. **Checkout.** `actions/checkout` reads `github.repository`, which is the
   Workspace, and copies the Workspace repo (Portfolio, Brief, past Resumes)
   into `$GITHUB_WORKSPACE` inside the container ([reuse-ref], **inference**).
6. **Tailor.** `hem` runs inside the container. It gets the Job Posting from
   the `JOB_POSTING` env var and the API key from the secret. It writes a Resume
   Draft under `resumes/` in the checkout. The secret is masked in logs
   ([secrets-ref]). Nothing resume-related should be printed.
7. **Deliver.** `git` and `gh`, both in the image, create a branch, commit,
   push it to the Workspace with the token, and open a PR. This works only
   because the token has `contents: write` and `pull-requests: write`, and the
   "allow Actions to create PRs" setting is on ([settings]). The PR does not
   trigger further workflows ([token]).
8. **After.** The runner is destroyed, and `$GITHUB_WORKSPACE` with it. What
   survives is a branch and PR in the private Workspace, plus the run's logs in
   the Workspace's Actions tab, for 90 days by default (#28). You review the PR,
   edit if needed, and merge it. That merge is accepting the Resume.
9. **Upgrading Hem.** When `hem` publishes immutable release `v0.4.0`,
   Dependabot opens a PR in the Workspace changing `@a1b2c3… # v0.3.0` to the
   new SHA and comment ([dependabot-actions]). Merging it moves both the
   workflow and the image forward together, because the digest lives inside the
   workflow file.

## Recommendation for Hem

1. **Workspace → `hem`: pin `uses:` by full commit SHA with a `# vX.Y.Z`
   comment**, and let Dependabot bump it. This is GitHub's own advice ([secure],
   [reuse-how]), and it costs nothing extra with Dependabot.
2. **`hem` → image: pin by digest in `tailor.yml`.** Combined with point 1, a
   Workspace's pin fixes *everything* that runs. GHCR tags can always be
   re-pointed, so a tag pin would leave the image as the one part that can
   change silently. Also push a human-readable `:vX.Y.Z` image tag for
   browsing, but never reference it from the workflow.
3. **Release with a small release PR (option 1 above)**, then publish an
   **immutable release** on the merge commit. This needs no PAT or App, and
   fits the existing PR-only ruleset. Move to an App-token automation (option 2)
   only if releases become frequent.
4. **Enable immutable releases on `hem` before the first release.** They
   aren't retroactive ([immut-how]).
5. **Build the image on a Debian-slim base with `git` and `gh` installed**, and
   keep `.github/` out of it via `.dockerignore`.

Why not tag pinning for the image? It saves one PR per release. But it would
make "`v0.3.0`" mean "whatever was last pushed as `:v0.3.0`". With GHCR
offering no immutable tags, that is the one silent-change hole left once the
workflow ref is SHA-pinned.

## Unverified or open

- GHCR lacking immutable tags rests on the docs' silence plus a community
  thread, not on a GitHub statement.
- That `GITHUB_TOKEN` pushes touching `.github/workflows/` are rejected rests on
  the absent `workflows` permission plus widely reported errors, not on a GitHub
  Docs sentence I found.
- Which plans include immutable releases. They appear to be available to all
  repos, but this wasn't stated on the pages read.
- That the called workflow's logs appear in the caller's Actions tab follows
  from the `github` context and billing belonging to the caller, but it isn't
  stated outright.
- The container mount path (`/__w/…`) and Alpine incompatibility with
  JavaScript actions are common knowledge, not documented on the pages read.
- That `docker buildx imagetools create` can retag without a rebuild isn't
  checked against Docker docs here.
- That a `container: image:` value in `name@sha256:…` form is accepted. The
  GHCR docs show pulling by digest, and the Actions docs don't show this form
  explicitly. Confirm it on the first Phase 3 run.

[understand]: https://docs.github.com/en/actions/get-started/understand-github-actions
[syntax]: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
[events]: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
[secure]: https://docs.github.com/en/actions/reference/security/secure-use
[token]: https://docs.github.com/en/actions/concepts/security/github_token
[settings]: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository
[secrets-ref]: https://docs.github.com/en/actions/reference/security/secrets
[secrets-how]: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets
[reuse-ref]: https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations
[reuse-how]: https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows
[contexts]: https://docs.github.com/en/actions/reference/workflows-and-actions/contexts
[variables]: https://docs.github.com/en/actions/reference/workflows-and-actions/variables
[job-ctx-changelog]: https://github.blog/changelog/2026-08-06-github-actions-early-august-2026-updates
[oidc-reuse]: https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-with-reusable-workflows
[container]: https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/run-jobs-in-a-container
[ghcr]: https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry
[pkg-billing]: https://docs.github.com/en/billing/concepts/product-billing/github-packages
[pkg-delete]: https://docs.github.com/en/packages/learn-github-packages/deleting-and-restoring-a-package
[docker-image]: https://docs.docker.com/get-started/docker-concepts/the-basics/what-is-an-image/
[docker-tag]: https://docs.docker.com/reference/cli/docker/image/tag/
[docker-pull]: https://docs.docker.com/reference/cli/docker/image/pull/
[dockerhub-immut]: https://docs.docker.com/docker-hub/repos/manage/hub-images/immutable-tags/
[bpa]: https://github.com/docker/build-push-action
[git-tag]: https://git-scm.com/docs/git-tag
[rulesets]: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets
[immut]: https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/immutable-releases
[immut-how]: https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/preventing-changes-to-your-releases
[immut-ga]: https://github.blog/changelog/2025-10-28-immutable-releases-are-now-generally-available/
[ghcr-immut-ask]: https://github.com/orgs/community/discussions/181783
[dependabot-eco]: https://docs.github.com/en/code-security/dependabot/ecosystems-supported-by-dependabot/supported-ecosystems-and-repositories
[dependabot-actions]: https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/auto-update-actions
[dependabot-reuse]: https://github.blog/changelog/2023-03-13-dependabot-updates-support-reusable-workflows-for-github-actions/
