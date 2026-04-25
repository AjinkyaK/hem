import { describe, it, expect } from "@jest/globals";
import { JobDetailsSchema } from "../../src/agent/types.js";

const validJobDetails = {
  title: "Senior Engineer",
  company: "Acme Corp",
  requiredSkills: ["Python", "SQL"],
  preferredSkills: ["Kubernetes"],
  responsibilities: ["Build APIs", "Review code"],
  experienceLevel: "senior" as const,
  keyThemes: ["data-driven", "cross-functional"],
  locationRemotePolicy: "Remote (US)",
  industryDomain: "Fintech",
  softSkills: ["communication", "collaboration"],
  educationCertifications: ["BS in Computer Science"],
  companyValuesCulture: ["customer obsession", "ownership"],
  highPriorityKeywords: ["distributed systems", "scalability"],
  atsKeywords: ["Python", "SQL", "Kubernetes", "AWS"],
};

describe("JobDetailsSchema", () => {
  it("validates a complete valid JobDetails object", () => {
    const result = JobDetailsSchema.safeParse(validJobDetails);
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const result = JobDetailsSchema.safeParse({
      title: "Engineer",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-array skills fields", () => {
    const result = JobDetailsSchema.safeParse({
      ...validJobDetails,
      requiredSkills: "Python",
    });
    expect(result.success).toBe(false);
  });

  it("requires locationRemotePolicy as a string", () => {
    const { locationRemotePolicy: _, ...rest } = validJobDetails;
    const result = JobDetailsSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("requires industryDomain as a string", () => {
    const { industryDomain: _, ...rest } = validJobDetails;
    const result = JobDetailsSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("requires softSkills as an array", () => {
    const { softSkills: _, ...rest } = validJobDetails;
    const result = JobDetailsSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("requires educationCertifications as an array", () => {
    const { educationCertifications: _, ...rest } = validJobDetails;
    const result = JobDetailsSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("requires companyValuesCulture as an array", () => {
    const { companyValuesCulture: _, ...rest } = validJobDetails;
    const result = JobDetailsSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("requires highPriorityKeywords as an array", () => {
    const { highPriorityKeywords: _, ...rest } = validJobDetails;
    const result = JobDetailsSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("requires atsKeywords as an array", () => {
    const { atsKeywords: _, ...rest } = validJobDetails;
    const result = JobDetailsSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("accepts empty arrays for the new array fields", () => {
    const result = JobDetailsSchema.safeParse({
      ...validJobDetails,
      softSkills: [],
      educationCertifications: [],
      companyValuesCulture: [],
      highPriorityKeywords: [],
      atsKeywords: [],
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty strings for the new string fields (e.g., 'unknown')", () => {
    const result = JobDetailsSchema.safeParse({
      ...validJobDetails,
      locationRemotePolicy: "unknown",
      industryDomain: "unknown",
    });
    expect(result.success).toBe(true);
  });
});
