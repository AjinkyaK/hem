// Runs one agent on one issue in a Docker sandbox, committing to BRANCH.
// Driven by .github/workflows/agent-implement.yml; see README "Agent runs".
//
// Reads:  ISSUE_FILE (gh issue view --json number,title,body), BRANCH, OUT_DIR,
//         CLAUDE_CODE_OAUTH_TOKEN.
// Writes: OUT_DIR/pr-title.txt, OUT_DIR/pr-body.md, and `commits=<n>` to
//         GITHUB_OUTPUT when set.
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { claudeCode, Output, run, StructuredOutputError } from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { z } from "zod";

const MODEL = "claude-opus-5-5";
const IMAGE = "sandcastle:hem";

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

const Issue = z.object({ number: z.number(), title: z.string(), body: z.string() });
const PullRequest = z.object({ title: z.string().min(1), body: z.string().min(1) });

const issue = Issue.parse(JSON.parse(readFileSync(required("ISSUE_FILE"), "utf8")));
const branch = required("BRANCH");
const outDir = required("OUT_DIR");

// The prompt is filled here and passed inline rather than as promptFile +
// promptArgs: sandcastle expands !`command` in a promptFile *after*
// substituting args, so issue text could run shell commands in the sandbox.
// One regex pass also stops issue text being re-scanned for placeholders.
const args: Record<string, string> = {
  ISSUE_NUMBER: String(issue.number),
  ISSUE_TITLE: issue.title,
  ISSUE_BODY: issue.body,
};
const template = readFileSync(path.join(import.meta.dirname, "prompt.md"), "utf8");
const prompt = template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => args[key] ?? match);

let pr: z.infer<typeof PullRequest> | undefined;
try {
  const result = await run({
    name: `issue-${issue.number}`,
    agent: claudeCode(MODEL),
    // Only this token enters the container. The GitHub token stays on the
    // host: the issue text is untrusted, so the agent can't push or comment.
    sandbox: docker({
      imageName: IMAGE,
      env: { CLAUDE_CODE_OAUTH_TOKEN: required("CLAUDE_CODE_OAUTH_TOKEN") },
    }),
    branchStrategy: { type: "branch", branch },
    prompt,
    maxIterations: 1,
    logging: { type: "stdout" },
    hooks: {
      sandbox: { onSandboxReady: [{ command: "uv sync --locked", timeoutMs: 300_000 }] },
    },
    output: Output.object({ tag: "pull_request", schema: PullRequest, maxRetries: 1 }),
  });
  pr = result.output;
} catch (error) {
  // Bad or missing PR text shouldn't throw away commits the agent made.
  if (!(error instanceof StructuredOutputError)) throw error;
  console.error(`No usable <pull_request> output: ${error.message}`);
}

const commits = Number(
  execFileSync("git", ["rev-list", "--count", `origin/main..${branch}`], { encoding: "utf8" }).trim(),
);

const closes = `Closes #${issue.number}`;
const title = pr?.title ?? `Implement #${issue.number}: ${issue.title}`;
const body = pr?.body ?? "The agent did not write a PR description.";

mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "pr-title.txt"), title);
writeFileSync(path.join(outDir, "pr-body.md"), body.includes(closes) ? body : `${closes}\n\n${body}`);

console.log(`Branch ${branch} is ${commits} commit(s) ahead of main.`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `commits=${commits}\n`);
