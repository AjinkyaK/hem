# Agentic Resume Tailor

A LangGraph-based workflow that analyzes job postings, extracts structured requirements, and iteratively tailors a markdown resume with human-in-the-loop review.

## Language

**Base Resume**:
The candidate's un-tailored, source-of-truth resume provided as plain text.
_Avoid_: Master resume, raw resume, resume template

**Job Posting**:
The target role's listing, provided as a public URL or raw text description.
_Avoid_: Job description, JD, job listing, job spec

**Job Details**:
The structured 14-field extraction capturing required/preferred skills, seniority, themes, culture, and ATS keywords from a Job Posting.
_Avoid_: Extracted job, job schema, job metadata

**Resume Draft**:
A tailored markdown version of the resume aligned to a specific Job Posting at a given revision number.
_Avoid_: Tailored resume, draft version, resume output

**Human Review**:
The checkpoint step where execution pauses via interrupt to allow candidate verification and feedback on a Resume Draft before finalization.
_Avoid_: HITL step, approval gate, user review

**Revision Feedback**:
Targeted critique or edit instructions provided by the candidate when requesting modifications to a Resume Draft.
_Avoid_: User comments, change requests, review notes

