"""Pytest configuration and shared fixtures."""

import pytest


@pytest.fixture
def base_job_details():
    """Return a baseline JobDetails dictionary fixture."""
    return {
        "title": "Senior Engineer",
        "company": "Acme Corp",
        "requiredSkills": ["Python", "SQL"],
        "preferredSkills": ["Kubernetes"],
        "responsibilities": ["Build APIs", "Review code"],
        "experienceLevel": "senior",
        "keyThemes": ["data-driven", "cross-functional"],
        "locationRemotePolicy": "Remote (US)",
        "industryDomain": "Fintech",
        "softSkills": ["communication", "collaboration"],
        "educationCertifications": ["BS in Computer Science"],
        "companyValuesCulture": ["customer obsession", "ownership"],
        "highPriorityKeywords": ["distributed systems", "scalability"],
        "atsKeywords": ["Python", "SQL", "Kubernetes", "AWS"],
    }
