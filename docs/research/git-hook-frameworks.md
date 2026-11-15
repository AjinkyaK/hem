# Git hook frameworks for a uv-managed Python repo

Date: 2026-11-14

## Question

Which mechanism should run `ruff check`, `ruff format --check`, pyright and pytest
(57 tests, about 1s, offline) as git hooks in Hem? The options are pre-commit, prek,
lefthook, and plain git hooks (with `core.hooksPath` pointing at a committed
directory). The constraints: tooling should be Python/uv-native, the toolchain should
not depend on Node, `uv.lock` is committed, and the dev group currently holds pytest,
pytest-asyncio and ruff, with pyright to be added.

This document compares the options. It does not decide between them.

## Comparison

| Criterion | pre-commit | prek | lefthook | plain hooks + `core.hooksPath` |
|---|---|---|---|---|
| Does `uv sync` alone activate hooks? | No. Needs `pre-commit install` | No. Needs `prek install` (or `prek init`) | No. Needs `lefthook install`. After that, hooks re-sync themselves when the config changes | No. Needs `git config core.hooksPath <dir>` |
| Where tools run from | Remote repos get isolated envs pinned by `rev:`. `repo: local` + `language: unsupported`/`system` uses PATH or `.venv` (e.g. `entry: uv run ...`) | Same model. Python envs are built with uv. `system`/`unsupported` are supported | Whatever `run:` says. There are no managed envs, so `uv run ...` uses `.venv` | Whatever the script says |
| pre-push support | Yes: `stages`, `default_install_hook_types`, `--hook-type pre-push` | Yes: same keys, and `-t pre-push` | Yes: any git hook name, with a `{push_files}` template | Yes: write a `pre-push` script |
| Staged-only behaviour | Stashes unstaged changes while hooks run | Stashes unstaged changes while hooks run | Hides unstaged changes since v1.3.0 (maintainer comment). `{staged_files}` and `stage_fixed` are available | You write it yourself |
| Speed (primary sources only) | No claims found | Vendor benchmark: framework overhead 1.78x to 3.40x lower than pre-commit | Vendor claim "Fast", with no numbers | No framework overhead |
| CI | `pre-commit run --all-files`, pre-commit.ci, `SKIP=` | `prek run --all-files`, `j178/prek-action`, `PREK_SKIP`/`SKIP` | `lefthook run <hook>`. Disable with `LEFTHOOK=0` | Run the script, or the `uv run` commands directly |
| On PyPI | Yes, `pre-commit` 4.7.0 (pure Python, needs Python >=3.11) | Yes, `prek` 0.5.10 (Rust binary wheels) | Yes, `lefthook` 2.2.2 (platform wheels, Go binary) | Not applicable (git only) |
| Runtime needed | Python. Downloads Node only for `language: node` hooks | None (single binary). Downloads uv if it is missing | None (Go binary) | git and a POSIX shell |

## pre-commit

- **Bootstrap.** `pre-commit install` "Installs the hook scripts alongside any existing git
  hooks". It uses `default_install_hook_types` (default `[pre-commit]`) unless
  `--hook-type` is passed. `--install-hooks` also builds the environments up front
  ([pre-commit.com](https://pre-commit.com/)). The only auto-install mechanism is
  `pre-commit init-templatedir`. It puts the hook into a git `init.templateDir`, so new
  clones get it. It is a per-user global setup, not a per-repo one
  ([pre-commit.com](https://pre-commit.com/)). `uv sync` alone does nothing, so with a
  dev dependency the bootstrap is `uv sync && uv run pre-commit install`.
- **Environments.** Remote hook repos are pinned by `rev:` and installed into isolated
  envs. For Python, `additional_dependencies` are "appended to the `pip install`
  command" ([pre-commit.com](https://pre-commit.com/)). These pins are separate from
  `uv.lock` and can drift from it. `repo: local` hooks can use `language: python`, which
  still gets an isolated env built from `additional_dependencies`. They can also use
  `language: unsupported`, previously called `system`: "the alias will be removed in a
  future version" (new in 4.4.0). With `unsupported`, no environment is created and the
  tool must already exist ([pre-commit.com](https://pre-commit.com/)). Using
  `language: unsupported` with `entry: uv run ruff check` or `entry: uv run pyright`
  makes the hook use the `.venv` locked by `uv.lock`. This follows from the
  `unsupported` semantics plus the fact that `uv run` "will ensure that the project
  environment is up-to-date before running"
  ([uv run docs](https://docs.astral.sh/uv/concepts/projects/run/)).
- **pre-push.** A hook declares `stages: [pre-push]`, and `default_stages` sets the default
  stage for hooks that don't. `pre-push` exports `PRE_COMMIT_FROM_REF`,
  `PRE_COMMIT_REMOTE_NAME` and others. A `manual` stage runs only through
  `pre-commit run --hook-stage manual`. The shim still has to be installed, via
  `default_install_hook_types: [pre-commit, pre-push]` or a repeated `--hook-type`
  ([pre-commit.com](https://pre-commit.com/)).
- **Staged-only behaviour.** The hook "only runs on the staged contents of files by
  temporarily stashing the unstaged changes while running hooks"
  ([pre-commit.com](https://pre-commit.com/)). Whole-project tools need
  `pass_filenames: false`, because filenames are passed by default. They also need
  `always_run: true` to run when no files match
  ([pre-commit.com](https://pre-commit.com/)). Since the stash is in place while they
  run, pyright and pytest see the staged tree. I could not verify whether untracked
  files are included in the stash.
- **Speed.** I found no primary-source speed claims for pre-commit itself.
- **CI.** The docs recommend `pre-commit run --all-files` in CI. `SKIP=hook_id,...`
  skips individual hooks ([pre-commit.com](https://pre-commit.com/)). pre-commit.ci is
  a hosted service. It is free for open source, paid for private repos, supports GitHub
  only, and offers autofix PRs, weekly autoupdate and a `ci: skip:` list
  ([pre-commit.ci](https://pre-commit.ci/)). The pre-commit.ci page does not document
  how it treats `language: unsupported`/`system` hooks. An older pre-commit-ci issue
  says that local/system hooks cannot get their dependencies installed there
  ([pre-commit-ci/issues#13](https://github.com/pre-commit-ci/issues/issues/13)). That is
  unverified for today's service. It matters because the `uv run` pattern needs uv on
  the runner.
- **Install.** pre-commit is on PyPI (4.7.0, `requires_python >=3.11`). It depends on
  `virtualenv` and `nodeenv` ([PyPI JSON](https://pypi.org/pypi/pre-commit/json)). It
  works as a `[dependency-groups] dev` entry, with `uv tool install pre-commit`, or with
  `uvx pre-commit`. For `language: node` hooks, "pre-commit will download and build a
  copy of node" ([pre-commit.com](https://pre-commit.com/)). Hem would use no such
  hooks.
- **Lock sync helpers.** These are not first-party. `sync-with-uv` (third-party,
  [PyPI](https://pypi.org/project/sync-with-uv/)) rewrites `rev:` values to match
  `uv.lock`. Astral's first-party `astral-sh/uv-pre-commit` offers only `uv-lock`,
  `uv-export` and `pip-compile` hooks, and does not sync revs
  ([uv docs](https://docs.astral.sh/uv/guides/integration/pre-commit/)).

## prek

- **What it is.** A Rust "drop-in alternative to pre-commit" that reads
  `.pre-commit-config.yaml` and also a native `prek.toml`
  ([README](https://github.com/j178/prek)). Known gaps: `pre-commit hazmat` is not
  implemented. prek-only keys include `repo: builtin`, `shell`, `env`, `priority` and
  `groups` ([compatibility](https://prek.j178.dev/compatibility/)).
- **Bootstrap.** `prek install` installs shims for `--hook-type` values, or else for
  `default_install_hook_types`, "falling back to `pre-commit`". `--prepare-hooks`
  (alias `--install-hooks`) builds the environments
  ([CLI reference](https://prek.j178.dev/reference/cli/)). `prek init` creates
  `prek.toml` and installs the shim in one step
  ([diff](https://prek.j178.dev/diff/)). The docs describe no automatic shim install.
  prek honors repo-local `core.hooksPath`
  ([CLI reference](https://prek.j178.dev/reference/cli/)).
- **Environments and uv.** For Python hooks, "prek installs hook repositories with
  `uv pip install`". If uv is not on PATH, prek installs it from Astral's CDN, PyPI or
  pip. `PREK_UV_SOURCE=none` turns that off. Most `UV_*` env vars affect prek. prek also
  reads PEP 723 inline metadata (`dependencies`, `requires-python`) for local Python
  script hooks. `system` and `unsupported` are aliases, and both run with no managed
  env ([language support](https://prek.j178.dev/reference/language-support/)). The
  `repo: local` + `unsupported`/`system` + `entry: uv run ...` pattern therefore works
  the same as in pre-commit. The use of uv only speeds up isolated envs. It does not
  tie them to `uv.lock`, so remote `rev:` pins can still drift. `prek update --check`
  fails CI on outdated or mismatched frozen revs ([README](https://github.com/j178/prek)).
  It compares against upstream tags, not `uv.lock`.
- **pre-push.** `-t pre-push` is a valid shim type. `prek run --stage` filters by stage,
  and `--from-ref/--to-ref` limits the run to a diff
  ([CLI reference](https://prek.j178.dev/reference/cli/)).
- **Staged-only behaviour.** "Unstaged changes are temporarily stashed while the hooks
  run" ([running hooks](https://prek.j178.dev/running-hooks/)). The prek pages I read
  did not mention `pass_filenames`/`always_run` semantics apart from `system`
  (filenames are appended unless `pass_filenames: false`). Parity with pre-commit is
  implied by the drop-in claim but not verified here.
- **Speed (vendor benchmark).** prek's own benchmark ran on 2026-10-05 on an M3 Pro
  against pre-commit 4.6.1 with 960 files. Framework-only overhead was 3.40x lower with
  1 `system` hook and 1.78x lower with 10. Forward and reverse medians varied by up to
  14% ([benchmark](https://prek.j178.dev/benchmark/)). The larger multipliers, up to
  24x, come from Rust-native fast paths for `pre-commit-hooks`. Hem would not use those.
  For four `uv run` hooks whose combined runtime is seconds, framework overhead is a
  small share.
- **CI.** `prek run --all-files` is the recommended default, run via
  `j178/prek-action`. Cache `PREK_HOME` only if env prep is slow
  ([CI](https://prek.j178.dev/ci/)). Use `PREK_SKIP`, or `SKIP` as a fallback
  ([env vars](https://prek.j178.dev/reference/environment-variables/)).
- **Install.** prek is on PyPI as `prek` (0.5.10, platform binary wheels)
  ([PyPI JSON](https://pypi.org/pypi/prek/json)). The README lists `uv tool install prek`
  (recommended), `uvx prek` and `uv add --dev prek`. "Does not require Python or any
  other runtime" ([README](https://github.com/j178/prek)). It is also published on npm
  as `@j178/prek`, but nothing requires that channel.

## lefthook

- **What it is.** A Go git hooks manager. "Fast. It is written in Go. Can run commands
  in parallel." ([README](https://github.com/evilmartians/lefthook)).
- **Bootstrap.** `lefthook install` writes `.git/hooks/*` scripts that call
  `lefthook run {hook}` ([lefthook.dev](https://lefthook.dev/)). After that, lefthook
  "automatically installs and updates hooks when you run `lefthook run` if the
  configuration has changed". `no_auto_install` or `LEFTHOOK_NO_AUTO_INSTALL` turns this
  off ([no_auto_install](https://lefthook.dev/configuration/no_auto_install/)). This
  does not cover the first install. The npm package's postinstall can install hooks
  ([LEFTHOOK env](https://lefthook.dev/usage/envs/LEFTHOOK/)), but that path needs Node.
  The Python install page says nothing about auto-install.
- **Environments.** lefthook manages no tool environments. A `run: uv run pyright` job
  uses the `.venv` locked by `uv.lock`, so there is no second set of version pins.
- **pre-push.** "You can specify any Git hook or your own custom, e.g. `test`"
  ([Hook](https://lefthook.dev/configuration/Hook/)). `{push_files}` expands to "files
  that are committed but not pushed", and `{1}`, `{2}` expand to hook arguments
  ([run](https://lefthook.dev/configuration/run/)).
- **Staged-only behaviour.** `{staged_files}` expands to "staged files which you try to
  commit" ([run](https://lefthook.dev/configuration/run/)). `stage_fixed: true` runs
  `git add` on files after the command, and only for `pre-commit`
  ([stage_fixed](https://lefthook.dev/configuration/stage_fixed/)). For unstaged
  changes, the maintainer said that since v1.3.0 lefthook "saves the diff, stashes the
  unstaged changes, applied the hooks, and recovers the changed from diff"
  ([issue #140 comment](https://github.com/evilmartians/lefthook/issues/140#issuecomment-1439693848)).
  I did not find this documented on lefthook.dev. Whole-project jobs simply omit the
  template, e.g. `run: uv run pytest`. I did not verify whether jobs with no file
  template are skipped when no files match.
- **Speed.** The only claim is the vendor's word "Fast", with no figures.
- **CI.** `LEFTHOOK=0` (or `false`) disables lefthook for a git command
  ([LEFTHOOK env](https://lefthook.dev/usage/envs/LEFTHOOK/)). In CI you can run
  `lefthook run pre-commit` (probably with an `{all_files}` variant), or call the
  `uv run` commands directly. lefthook has no hosted equivalent of pre-commit.ci.
- **Install.** On PyPI as `lefthook` (2.2.2, 6 platform wheels: macOS x86_64/arm64,
  manylinux x86_64/aarch64, Windows amd64/arm64)
  ([PyPI JSON](https://pypi.org/pypi/lefthook/json)). The platform-specific wheels
  suggest the Go binary is bundled, but that is an inference: the Python install page
  does not say so. lefthook's docs list `uv add --dev lefthook` and `pipx install
  lefthook` ([Python install](https://lefthook.dev/installation/python/)). There are no
  musllinux wheels, so Alpine CI would need another channel.

## Plain git hooks + `core.hooksPath`

- **Bootstrap.** Hooks live in `$GIT_DIR/hooks` "but that can be changed via the
  `core.hooksPath` configuration variable". "Hooks that don't have the executable bit
  set are ignored" ([githooks](https://git-scm.com/docs/githooks)). A relative
  `core.hooksPath` "is taken as relative to the directory where the hooks are run"
  ([git-config](https://git-scm.com/docs/git-config)). Setup is one command,
  `git config core.hooksPath .githooks`. That is a local config value and is not part
  of the clone, which is my inference: git docs never say hooks or config come along
  with a clone, and `git init` only "may copy hooks" from a template
  ([githooks](https://git-scm.com/docs/githooks)). uv has no post-sync hook that could
  run the command, and I found none in the uv docs I read.
- **Environments.** The script calls `uv run ruff ...` and so on, which uses the locked
  `.venv`.
- **pre-push.** A `pre-push` script receives the remote name and URL as arguments, and
  `<local-ref> SP <local-object-name> SP <remote-ref> SP <remote-object-name>` lines on
  stdin. A non-zero exit aborts the push
  ([githooks](https://git-scm.com/docs/githooks)).
- **Staged-only behaviour.** Not provided. The script either checks the working tree,
  which may include unstaged edits, or implements its own stash/restore. pre-commit's
  and lefthook's issue history shows that stash/restore is easy to get wrong
  ([issue #140](https://github.com/evilmartians/lefthook/issues/140)).
- **Bypass and CI.** `git commit --no-verify` bypasses pre-commit
  ([githooks](https://git-scm.com/docs/githooks)). Either env var conventions are
  handled by hand, or CI calls the same script or `uv run` commands.
- **Install.** Nothing beyond git and a shell. Windows needs a shell that git can run,
  which I have not verified here.

## Trade-offs (not a decision)

- **Drift vs isolation.** Remote `rev:` hooks in pre-commit or prek are isolated and
  reproducible on their own. They are a second source of truth next to `uv.lock`, so a
  hook's ruff and `uv run ruff` in CI can disagree. Keeping them aligned takes a
  third-party syncer (`sync-with-uv`) or manual discipline. `repo: local` +
  `language: unsupported` + `entry: uv run ...` removes that drift, at the cost of
  needing `uv sync` to have run. The alias name `system` is being deprecated, so a new
  config should use `unsupported`.
- **`repo: local` + `uv run` erases most differences.** Once every hook is
  `uv run <tool>` with `pass_filenames: false` (for pyright and pytest), the framework
  only contributes:
  - install UX
  - stashing of unstaged changes
  - `SKIP` selection
  - stage routing (pre-commit vs pre-push)
  - parallelism

  Hook ecosystems, prek's uv-backed envs and the vendor speed numbers mostly stop
  mattering. The remaining differences are prek's single binary vs pre-commit's Python
  dependency tree, lefthook's auto re-sync after first install, and plain hooks having
  no staged-only isolation.
- **Bootstrap friction is equal.** No option is activated by `uv sync` alone. Each needs
  one extra command per clone: `uv run pre-commit install`, `uv run prek install`,
  `uv run lefthook install`, or `git config core.hooksPath ...`. That command could be
  documented in the README or wrapped in a make/just/script target. A dev-group
  dependency pins the hook manager's version in `uv.lock`. `uv tool install` and `uvx`
  do not, because tools "are always run isolated from the project"
  ([uv tools](https://docs.astral.sh/uv/concepts/tools/)).
- **Staged-only vs whole-project tools.** A stash only protects against checking
  unstaged edits. pyright and pytest still run over the whole project, which is correct
  for them. With plain hooks, a commit can pass or fail because of unstaged work.
- **Hook placement.** pytest (about 1s) and pyright are candidates for either
  `pre-commit` or `pre-push`. All four options support `pre-push`. In pre-commit and
  prek, both shim types must be in `default_install_hook_types`.
- **CI reuse.** Running `uv run ruff check`, `uv run ruff format --check`,
  `uv run pyright` and `uv run pytest` directly in CI avoids installing any hook
  framework there. The cost is two lists of commands that must be kept in sync.
  Alternatively, CI can call `pre-commit run --all-files` or `prek run --all-files` and
  reuse the config. pre-commit.ci's support for `unsupported`/`system` + uv hooks is
  unverified.
- **pyright pulls in Node.** The PyPI `pyright` package (1.1.414) is a wrapper. It uses
  Node from PATH, or else downloads Node at runtime via `nodeenv`, then installs the
  pyright npm package. The `pyright[nodejs]` extra uses `nodejs-wheel-binaries` instead,
  which upstream calls "more reliable"
  ([PyPI pyright](https://pypi.org/project/pyright/),
  [PyPI JSON](https://pypi.org/pypi/pyright/json)). Consequences:
  - Node ends up in the toolchain implicitly, whichever hook framework is chosen.
  - The first run likely needs network access, which the docs imply but do not state.
  - The cache lives in `~/.cache` unless `PYRIGHT_PYTHON_CACHE_DIR` is set.
  - `PYRIGHT_PYTHON_FORCE_VERSION=latest` would bypass the pyright version locked by
    `uv.lock`.

  This affects the "no Node" constraint more than the choice of hook framework does.

## Sources

- https://pre-commit.com/
- https://pre-commit.ci/
- https://github.com/pre-commit-ci/issues/issues/13 (dated issue, may be stale)
- https://pypi.org/pypi/pre-commit/json
- https://github.com/j178/prek
- https://prek.j178.dev/diff/
- https://prek.j178.dev/compatibility/
- https://prek.j178.dev/reference/cli/
- https://prek.j178.dev/reference/language-support/
- https://prek.j178.dev/reference/environment-variables/
- https://prek.j178.dev/running-hooks/
- https://prek.j178.dev/ci/
- https://prek.j178.dev/benchmark/ (vendor benchmark)
- https://pypi.org/pypi/prek/json
- https://github.com/evilmartians/lefthook
- https://github.com/evilmartians/lefthook/issues/140#issuecomment-1439693848
- https://lefthook.dev/
- https://lefthook.dev/installation/python/
- https://lefthook.dev/configuration/Hook/
- https://lefthook.dev/configuration/run/
- https://lefthook.dev/configuration/stage_fixed/
- https://lefthook.dev/configuration/no_auto_install/
- https://lefthook.dev/usage/envs/LEFTHOOK/
- https://pypi.org/pypi/lefthook/json
- https://git-scm.com/docs/githooks
- https://git-scm.com/docs/git-config (core.hooksPath)
- https://docs.astral.sh/uv/concepts/tools/
- https://docs.astral.sh/uv/concepts/projects/run/
- https://docs.astral.sh/uv/concepts/projects/dependencies/
- https://docs.astral.sh/uv/guides/integration/pre-commit/
- https://pypi.org/project/pyright/ and https://pypi.org/pypi/pyright/json
- https://pypi.org/project/sync-with-uv/ (third-party)
