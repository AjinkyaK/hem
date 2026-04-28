import fs from "fs";
import path from "path";
import os from "os";
import { JobDetails } from "../types.js";

const DEFAULT_OUTPUT_DIR = path.join(
  os.homedir(),
  "ajinkyakale",
  "TailoredResumes",
);

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
  outputDir: string = DEFAULT_OUTPUT_DIR,
): string {
  const company = slugify(jobDetails.company);
  const title = slugify(jobDetails.title);
  const filename = `${company}_${title}_v${version}.md`;
  const filePath = path.join(outputDir, filename);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(filePath, draft, "utf-8");

  return filePath;
}
