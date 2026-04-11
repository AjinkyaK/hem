// src/agent/types.ts
import { z } from "zod";

export const JobDetailsSchema = z.object({
  title: z.string(),
  company: z.string(),
  requiredSkills: z.array(z.string()),
  preferredSkills: z.array(z.string()),
  responsibilities: z.array(z.string()),
  experienceLevel: z.string(),
  keyThemes: z.array(z.string()),
});

export type JobDetails = z.infer<typeof JobDetailsSchema>;
