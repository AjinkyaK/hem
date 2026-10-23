import fs from "fs";
import path from "path";
import os from "os";
import { JobDetails } from "../types.js";

export function getDefaultOutputDir(): string {
  return (
    process.env.TAILORED_RESUME_DIR ||
    path.join(os.homedir(), "TailoredResumes")
  );
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

export function writeResumeDraft(
  draft: string,
  jobDetails: JobDetails,
  version: number,
  outputDir: string = getDefaultOutputDir(),
): string {
  const company = slugify(jobDetails.company);
  const title = slugify(jobDetails.title);
  const filename = `${company}_${title}_v${version}.md`;
  const filePath = path.join(outputDir, filename);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(filePath, draft, "utf-8");

  return filePath;
}
