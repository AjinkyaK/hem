"""Unit tests for write_resume_draft utility."""

import os
from pathlib import Path

from hem.types import JobDetails
from hem.utils.write_resume_draft import (
    slugify,
    write_resume_draft,
)


def test_creates_output_directory_if_not_exists(tmp_path, base_job_details):
    out_dir = tmp_path / "new_dir"
    details = JobDetails(**base_job_details)
    write_resume_draft("# Resume", details, 1, str(out_dir))
    assert out_dir.exists()


def test_writes_draft_content_to_md_file(tmp_path, base_job_details):
    details = JobDetails(**base_job_details)
    file_path = write_resume_draft("# My Resume", details, 1, str(tmp_path))
    content = Path(file_path).read_text(encoding="utf-8")
    assert content == "# My Resume"


def test_returns_absolute_file_path(tmp_path, base_job_details):
    details = JobDetails(**base_job_details)
    file_path = write_resume_draft("# Resume", details, 1, str(tmp_path))
    assert os.path.isabs(file_path)
    assert file_path.endswith(".md")


def test_slugifies_company_and_title(tmp_path, base_job_details):
    base_job_details["company"] = "Stripe, Inc."
    base_job_details["title"] = "Senior Software Engineer"
    details = JobDetails(**base_job_details)
    file_path = write_resume_draft("# Resume", details, 1, str(tmp_path))
    filename = Path(file_path).name
    assert filename == "stripe_inc_senior_software_engineer_rev1.md"


def test_includes_revision_number(tmp_path, base_job_details):
    details = JobDetails(**base_job_details)
    file_path = write_resume_draft("# Resume", details, 3, str(tmp_path))
    assert file_path.endswith("_rev3.md")


def test_writes_distinct_files_for_different_revisions(tmp_path, base_job_details):
    details = JobDetails(**base_job_details)
    path1 = write_resume_draft("v1", details, 1, str(tmp_path))
    path2 = write_resume_draft("v2", details, 2, str(tmp_path))
    assert path1 != path2
    assert Path(path1).read_text() == "v1"
    assert Path(path2).read_text() == "v2"


def test_is_idempotent(tmp_path, base_job_details):
    details = JobDetails(**base_job_details)
    path1 = write_resume_draft("# Resume", details, 1, str(tmp_path))
    path2 = write_resume_draft("# Resume", details, 1, str(tmp_path))
    assert path1 == path2
    assert Path(path2).read_text() == "# Resume"


def test_respects_env_tailored_resume_dir(tmp_path, base_job_details, monkeypatch):
    custom_dir = tmp_path / "custom_env_dir"
    monkeypatch.setenv("TAILORED_RESUME_DIR", str(custom_dir))
    details = JobDetails(**base_job_details)
    file_path = write_resume_draft("# Resume", details, 1)
    assert file_path.startswith(str(custom_dir))
    assert Path(file_path).exists()


def test_slugify():
    assert slugify("Stripe, Inc.") == "stripe_inc"
    assert slugify("Senior  Software Engineer   ") == "senior_software_engineer"
    assert slugify("C# / .NET Developer") == "c_net_developer"
