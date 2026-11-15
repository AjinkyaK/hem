# Hem

The project's goal is **Tailoring**: aligning an Applicant's Portfolio to a Job Posting.

## Language

**Applicant**:
The person applying to a Job Posting, who comes away with a Resume Draft they accept for that application. They supply the Portfolio and Job Posting and perform Human Review.
_Avoid_: candidate, user

**Portfolio**:
The Applicant's markdown source of truth: their fixed facts plus a bank of every project they have worked on. It holds more than any one resume.
_Avoid_: base resume, master resume, project bank

**Job Posting**:
The target role's listing, as the Applicant supplies it.
_Avoid_: job description, JD

**Job Details**:
The structured requirements extracted from a Job Posting.

**Tailoring**:
Producing a Resume Draft from a Portfolio and Job Details by rephrasing, reordering, emphasising, and rewording experience into the Job Posting's vocabulary, only as far as the Portfolio supports. Nothing is invented.

**Fixed Fact**:
A fact in the Portfolio that a Resume Draft must state exactly as written: identity and contact details, employers, titles, dates, education, years of experience, numbers, and named technologies.
_Avoid_: static fact

**Claim**:
One statement in a Resume Draft about the Applicant's experience, judged on its own during Review.
_Avoid_: bullet (a bullet can hold several Claims)

**Anchor**:
The word-for-word Portfolio quote a Claim rests on.
_Avoid_: citation, evidence

**Direct Claim**:
A Claim that says what its Anchor says.

**Reworded Claim**:
A Claim that recasts its Anchor in the Job Posting's vocabulary, such as DataOps pipeline work presented as workflow orchestration. It may not change a Fixed Fact.
_Avoid_: transferred claim

**Stretch**:
A Reworded Claim that goes further than its Anchor reasonably supports.
_Avoid_: exaggeration

**Invented Claim**:
A Claim with no Anchor, or one that changes a Fixed Fact.
_Avoid_: unsupported claim, hallucination

**Gap**:
A requirement in the Job Details that no project in the Portfolio could support, even reworded.

**Resume Draft**:
A markdown resume produced for one Job Posting.
_Avoid_: tailored resume

**Revision**:
The sequence number of a Resume Draft: 1 for the draft Tailoring produces, +1 for each draft produced from a Critique.
_Avoid_: version, draft version

**Review**:
The Reviewer's check of a Resume Draft against the Portfolio and Job Details. Every Review ends in a Verdict.
_Avoid_: judge, AI review

**Reviewer**:
The AI that performs Review. It is not the Applicant.
_Avoid_: judge, evaluator

**Verdict**:
The outcome of a Review: the Resume Draft passes, or it gets a Critique.

**Critique**:
The Reviewer's specific, located list of what to change in a Resume Draft. Tailoring answers a Critique with the next Revision.
_Avoid_: feedback, review comments

**Human Review**:
The pause where the Applicant reads a Resume Draft and either gives Revision Feedback or accepts it.

**Revision Feedback**:
The Applicant's instructions for changing a Resume Draft.
_Avoid_: user feedback

## Relationships

Portfolio + Job Posting → Job Details → Tailoring → Resume Draft → Review → (Critique → Resume Draft → Review)*

- An Applicant supplies one Portfolio and one Job Posting.
- A Job Posting yields one Job Details.
- Tailoring turns a Portfolio and Job Details into a Resume Draft at Revision 1.
- Every Resume Draft goes through Review.
- A Critique on a Resume Draft produces the next Resume Draft, at Revision + 1.
- Review ends in a Verdict: pass, or a Critique. A Resume Draft passes when it has no Invented Claim and meets every requirement in the Job Details that is not a Gap.
- A Stretch earns a Critique item but does not by itself stop a Resume Draft passing.
- Revisions stop when a Resume Draft passes, the Revision limit is reached, or a Critique repeats the previous one.
- The Applicant reads the final Resume Draft before sending it; Review does not replace that read.

## Flagged gaps

- **Human Review and Revision Feedback are being retired.** Their entries, and the Applicant's "perform Human Review", stay until "What happens to the Human Review code" (#35) settles the retirement.

- **Accepting a Resume Draft has no term yet.** Deferred to the interface refactor. Until then, `user_feedback`, `TAILORED_RESUME_DIR`, and `~/TailoredResumes` keep their names.
