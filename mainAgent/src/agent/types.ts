// src/agent/types.ts
import { z } from "zod";

export const JobDetailsSchema = z.object({
  title: z.string(),
  company: z.string(),
  requiredSkills: z.array(z.string()),
  preferredSkills: z.array(z.string()),
  responsibilities: z.array(z.string()),
  experienceLevel: z.enum(["entry", "mid", "senior", "staff", "principal", "executive", "unknown"]),
  keyThemes: z.array(z.string()),
  locationRemotePolicy: z.string(),
  industryDomain: z.string(),
  softSkills: z.array(z.string()),
  educationCertifications: z.array(z.string()),
  companyValuesCulture: z.array(z.string()),
  highPriorityKeywords: z.array(z.string()),
  atsKeywords: z.array(z.string()),
});

export type JobDetails = z.infer<typeof JobDetailsSchema>;

export const TailorOutputSchema = z.object({
  thinking: z.string(),
  resume: z.string(),
});

export type TailorOutput = z.infer<typeof TailorOutputSchema>;
