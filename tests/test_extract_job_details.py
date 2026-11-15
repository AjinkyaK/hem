"""Unit tests for JobDetails schema validation."""

import pytest
from pydantic import ValidationError

from hem.types import JobDetails


def test_validates_complete_valid_job_details(base_job_details):
    details = JobDetails(**base_job_details)
    assert details.title == "Senior Engineer"
    assert details.experience_level == "senior"
    assert "Python" in details.required_skills


def test_rejects_missing_required_fields():
    with pytest.raises(ValidationError):
        JobDetails(title="Engineer")


def test_rejects_non_array_skills_fields(base_job_details):
    invalid = {**base_job_details, "requiredSkills": "Python"}
    with pytest.raises(ValidationError):
        JobDetails(**invalid)


def test_requires_location_remote_policy_as_string(base_job_details):
    invalid = {**base_job_details}
    del invalid["locationRemotePolicy"]
    with pytest.raises(ValidationError):
        JobDetails(**invalid)


def test_requires_industry_domain_as_string(base_job_details):
    invalid = {**base_job_details}
    del invalid["industryDomain"]
    with pytest.raises(ValidationError):
        JobDetails(**invalid)


def test_requires_soft_skills_as_array(base_job_details):
    invalid = {**base_job_details}
    del invalid["softSkills"]
    with pytest.raises(ValidationError):
        JobDetails(**invalid)


def test_requires_education_certifications_as_array(base_job_details):
    invalid = {**base_job_details}
    del invalid["educationCertifications"]
    with pytest.raises(ValidationError):
        JobDetails(**invalid)


def test_requires_company_values_culture_as_array(base_job_details):
    invalid = {**base_job_details}
    del invalid["companyValuesCulture"]
    with pytest.raises(ValidationError):
        JobDetails(**invalid)


def test_requires_high_priority_keywords_as_array(base_job_details):
    invalid = {**base_job_details}
    del invalid["highPriorityKeywords"]
    with pytest.raises(ValidationError):
        JobDetails(**invalid)


def test_requires_ats_keywords_as_array(base_job_details):
    invalid = {**base_job_details}
    del invalid["atsKeywords"]
    with pytest.raises(ValidationError):
        JobDetails(**invalid)


def test_accepts_empty_arrays_for_array_fields(base_job_details):
    valid = {
        **base_job_details,
        "softSkills": [],
        "educationCertifications": [],
        "companyValuesCulture": [],
        "highPriorityKeywords": [],
        "atsKeywords": [],
    }
    details = JobDetails(**valid)
    assert details.soft_skills == []


def test_accepts_unknown_for_string_fields(base_job_details):
    valid = {
        **base_job_details,
        "locationRemotePolicy": "unknown",
        "industryDomain": "unknown",
    }
    details = JobDetails(**valid)
    assert details.location_remote_policy == "unknown"


def test_validates_experience_level_enum(base_job_details):
    for level in [
        "entry",
        "mid",
        "senior",
        "staff",
        "principal",
        "executive",
        "unknown",
    ]:
        valid = {**base_job_details, "experienceLevel": level}
        details = JobDetails(**valid)
        assert details.experience_level == level


def test_rejects_invalid_experience_level(base_job_details):
    invalid = {**base_job_details, "experienceLevel": "intern"}
    with pytest.raises(ValidationError):
        JobDetails(**invalid)
