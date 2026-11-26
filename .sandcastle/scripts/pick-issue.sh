#!/usr/bin/env bash
# Prints the number of the issue an agent run should implement.
#
#   pick-issue.sh        oldest eligible `ready-for-agent` issue
#   pick-issue.sh 43     issue #43, if it is eligible
#
# Eligible means open, labelled `ready-for-agent`, without sub-issues, unassigned, with no open
# `blocked_by` issues and no open PR that says "Closes #<n>", and written by
# someone with write access (its text becomes the agent's prompt).
# Exits 1 with the reason on stderr when nothing is eligible.
# Needs GH_TOKEN and GH_REPO.
set -euo pipefail

LABEL="ready-for-agent"

# Prints why issue $1 is ineligible, or nothing if it is eligible.
why_ineligible() {
  local n="$1" issue prs
  issue=$(gh api "repos/${GH_REPO}/issues/${n}")

  jq -r --arg label "$LABEL" '
    if .pull_request then "#\(.number) is a pull request"
    elif .state != "open" then "#\(.number) is \(.state)"
    elif ([.labels[].name] | index($label) | not) then "#\(.number) is not labelled \($label)"
    elif (.sub_issues_summary.total // 0) > 0 then "#\(.number) has sub-issues, so it is a spec or map, not a ticket"
    elif (.assignees | length) > 0 then "#\(.number) is assigned to \([.assignees[].login] | join(", "))"
    elif (.author_association | IN("OWNER", "MEMBER", "COLLABORATOR") | not) then "#\(.number) was written by \(.user.login), who has no write access"
    elif (.issue_dependencies_summary.blocked_by // 0) > 0 then "#\(.number) is blocked by \(.issue_dependencies_summary.blocked_by) open issue(s)"
    else empty end' <<<"$issue"

  prs=$(gh pr list --repo "$GH_REPO" --state open --search "in:body \"Closes #${n}\"" \
    --json number,body --jq "[.[] | select(.body | test(\"(?i)closes #${n}\\\\b\")) | \"#\\(.number)\"] | join(\", \")")
  if [[ -n "$prs" ]]; then
    echo "#${n} already has an open PR: ${prs}"
  fi
}

if [[ -n "${1:-}" ]]; then
  reason=$(why_ineligible "$1")
  if [[ -n "$reason" ]]; then
    echo "$reason" >&2
    exit 1
  fi
  echo "$1"
  exit 0
fi

candidates=$(gh issue list --repo "$GH_REPO" --state open --label "$LABEL" \
  --search "no:assignee sort:created-asc" --limit 100 --json number --jq '.[].number')
for n in $candidates; do
  reason=$(why_ineligible "$n")
  if [[ -z "$reason" ]]; then
    echo "$n"
    exit 0
  fi
  echo "skip: $reason" >&2
done

echo "No eligible ${LABEL} issue." >&2
exit 1
