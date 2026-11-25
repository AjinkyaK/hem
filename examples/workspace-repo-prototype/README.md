# PROTOTYPE: throwaway Hem Workspace repo

**Throwaway.** Built to answer the wayfinder ticket "How a run's branch, PR and
Workspace fit together" (AjinkyaK/hem#40). Delete this repo when done.

This is a Workspace stored as a private repo: `portfolio.md`, `brief.md` and
`resumes/` at the root, plus a thin caller workflow. There is no real `hem`:
`.github/workflows/hem-stub.yml` stands in for `hem`'s public reusable workflow,
and its "fake hem" step copies a canned draft from `.prototype/` instead of
calling Claude. It costs nothing and needs no `ANTHROPIC_API_KEY`.

## Things to try (Actions tab → "Tailor a resume" → Run workflow)

1. **First run.** `job` = `Lumen Freight | Staff Platform Engineer`, outcome `pass`.
   Watch branch `hem/lumen-freight/staff-platform-engineer` and its PR appear.
2. **Rerun, PR still open.** Same job, outcome `not-passed`. The same PR updates
   in place; the banner and the `review.md` header change.
3. **Failed run.** Any job, outcome `fail`. The job goes red, no branch or PR
   appears, and the output is a 7-day artifact on the run page.
4. **Merge** the PR (this is "accepting" the draft: it becomes a Resume).
5. **Rerun after merge.** Same job again. A new PR opens whose diff replaces the
   accepted Resume.
6. **Collision.** Same company and title, `name` = `platform-2`.
7. **Queueing.** Click Run twice fast: the second waits for the first.
