# Agentic Resume Tailor

The project's goal is **Tailoring**: aligning a Candidate's Base Resume to a Job Posting.

## Language

**Candidate**:
The person whose resume is being tailored, and who performs Human Review.
_Avoid_: user

**Base Resume**:
The Candidate's un-tailored, source-of-truth resume.
_Avoid_: raw resume

**Job Posting**:
The target role's listing, as the Candidate supplies it.
_Avoid_: job description, JD

**Job Details**:
The structured requirements extracted from a Job Posting.

**Tailoring**:
Producing a Resume Draft from a Base Resume and Job Details by rephrasing, reordering, and emphasising only what the Base Resume supports. Nothing is invented.

**Resume Draft**:
A markdown resume produced for one Job Posting.
_Avoid_: tailored resume

**Revision**:
The sequence number of a Resume Draft: 1 for the draft Tailoring produces, +1 for each draft produced from Revision Feedback.
_Avoid_: version, draft version

**Human Review**:
The pause where the Candidate reads a Resume Draft and either gives Revision Feedback or accepts it.

**Revision Feedback**:
The Candidate's instructions for changing a Resume Draft.
_Avoid_: user feedback

## Relationships

Base Resume + Job Posting → Job Details → Tailoring → Resume Draft → Human Review → (Revision Feedback → Resume Draft)*

- A Candidate supplies one Base Resume and one Job Posting.
- A Job Posting yields one Job Details.
- Tailoring turns a Base Resume and Job Details into a Resume Draft at Revision 1.
- Every Resume Draft goes through Human Review.
- Revision Feedback on a Resume Draft produces the next Resume Draft, at Revision + 1.
- Human Review ends with either Revision Feedback or the Candidate accepting the Resume Draft (term deferred; see Flagged gaps).

## Flagged gaps

- **Accepting a Resume Draft has no term yet.** Deferred to the interface refactor. Until then, `user_feedback`, `TAILORED_RESUME_DIR`, and `~/TailoredResumes` keep their names.
