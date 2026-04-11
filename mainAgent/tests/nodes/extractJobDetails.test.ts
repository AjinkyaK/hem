import { describe, it, expect } from "@jest/globals";
import { JobDetailsSchema } from "../../src/agent/types.js";

describe("JobDetailsSchema", () => {
  it("validates a complete valid JobDetails object", () => {
    const result = JobDetailsSchema.safeParse({
      title: "Senior Engineer",
      company: "Acme Corp",
      requiredSkills: ["Python", "SQL"],
      preferredSkills: ["Kubernetes"],
      responsibilities: ["Build APIs", "Review code"],
      experienceLevel: "senior",
      keyThemes: ["data-driven", "cross-functional"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const result = JobDetailsSchema.safeParse({
      title: "Engineer",
      // missing all other fields
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-array skills fields", () => {
    const result = JobDetailsSchema.safeParse({
      title: "Engineer",
      company: "Acme",
      requiredSkills: "Python",  // should be array
      preferredSkills: [],
      responsibilities: [],
      experienceLevel: "mid",
      keyThemes: [],
    });
    expect(result.success).toBe(false);
  });
});
