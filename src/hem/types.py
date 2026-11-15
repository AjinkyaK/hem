"""Domain schemas and type definitions."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ExperienceLevel = Literal[
    "entry",
    "mid",
    "senior",
    "staff",
    "principal",
    "executive",
    "unknown",
]


class JobDetails(BaseModel):
    """Structured extraction capturing 14 fields from a Job Posting."""

    model_config = ConfigDict(populate_by_name=True)

    title: str
    company: str
    required_skills: list[str] = Field(alias="requiredSkills")
    preferred_skills: list[str] = Field(alias="preferredSkills")
    responsibilities: list[str]
    experience_level: ExperienceLevel = Field(alias="experienceLevel")
    key_themes: list[str] = Field(alias="keyThemes")
    location_remote_policy: str = Field(alias="locationRemotePolicy")
    industry_domain: str = Field(alias="industryDomain")
    soft_skills: list[str] = Field(alias="softSkills")
    education_certifications: list[str] = Field(alias="educationCertifications")
    company_values_culture: list[str] = Field(alias="companyValuesCulture")
    high_priority_keywords: list[str] = Field(alias="highPriorityKeywords")
    ats_keywords: list[str] = Field(alias="atsKeywords")


class TailorOutput(BaseModel):
    """Structured output for resume tailoring with explicit thinking step."""

    thinking: str
    resume: str
