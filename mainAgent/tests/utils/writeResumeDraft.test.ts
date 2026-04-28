import { describe, it, expect, afterEach } from "@jest/globals";
import fs from "fs";
import path from "path";
import os from "os";
import { writeResumeDraft } from "../../src/agent/utils/writeResumeDraft.js";
import { JobDetails } from "../../src/agent/types.js";

const tmpDir = path.join(os.tmpdir(), "writeResumeDraft_test");

const jobDetails: JobDetails = {
  title: "Senior Software Engineer",
  company: "Stripe, Inc.",
  requiredSkills: ["TypeScript", "Node.js"],
  preferredSkills: ["Kubernetes"],
  responsibilities: ["Build APIs"],
  experienceLevel: "senior",
  keyThemes: ["reliability"],
  locationRemotePolicy: "Remote",
  industryDomain: "Fintech",
  softSkills: [],
  educationCertifications: [],
  companyValuesCulture: [],
  highPriorityKeywords: [],
  atsKeywords: [],
};

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("writeResumeDraft", () => {
  it("creates the output directory if it does not exist", () => {
    writeResumeDraft("# Resume", jobDetails, 1, tmpDir);
    expect(fs.existsSync(tmpDir)).toBe(true);
  });

  it("writes the draft content to a .md file", () => {
    const filePath = writeResumeDraft("# My Resume", jobDetails, 1, tmpDir);
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toBe("# My Resume");
  });

  it("returns the absolute file path", () => {
    const filePath = writeResumeDraft("# Resume", jobDetails, 1, tmpDir);
    expect(path.isAbsolute(filePath)).toBe(true);
    expect(filePath.endsWith(".md")).toBe(true);
  });

  it("slugifies company and title into the filename", () => {
    const filePath = writeResumeDraft("# Resume", jobDetails, 1, tmpDir);
    const filename = path.basename(filePath);
    expect(filename).toBe("stripe_inc_senior_software_engineer_v1.md");
  });

  it("includes the version number in the filename", () => {
    const filePath = writeResumeDraft("# Resume", jobDetails, 3, tmpDir);
    const filename = path.basename(filePath);
    expect(filename).toMatch(/_v3\.md$/);
  });

  it("writes distinct files for different versions", () => {
    const path1 = writeResumeDraft("v1", jobDetails, 1, tmpDir);
    const path2 = writeResumeDraft("v2", jobDetails, 2, tmpDir);
    expect(path1).not.toBe(path2);
    expect(fs.readFileSync(path1, "utf-8")).toBe("v1");
    expect(fs.readFileSync(path2, "utf-8")).toBe("v2");
  });

  it("is idempotent: same inputs produce same path and same contents", () => {
    const path1 = writeResumeDraft("# Resume", jobDetails, 1, tmpDir);
    const path2 = writeResumeDraft("# Resume", jobDetails, 1, tmpDir);
    expect(path1).toBe(path2);
    expect(fs.readFileSync(path2, "utf-8")).toBe("# Resume");
  });
});
