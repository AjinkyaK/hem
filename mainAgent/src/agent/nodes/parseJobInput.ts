import { RunnableConfig } from "@langchain/core/runnables";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { StateAnnotation } from "../state.js";

const isUrl = (input: string): boolean =>
  input.trimStart().startsWith("http://") ||
  input.trimStart().startsWith("https://");

const fetchAndStripHtml = async (url: string): Promise<string> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch job posting: ${response.status} ${response.statusText}`,
    );
  }
  const html = await response.text();
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  const content = article?.textContent?.trim();
  if (!content) {
    throw new Error("Failed to extract readable job posting content from URL");
  }
  return content;
};

export const parseJobInput = async (
  state: typeof StateAnnotation.State,
  _config: RunnableConfig,
): Promise<typeof StateAnnotation.Update> => {
  if (!state.rawJobInput || state.rawJobInput.trim() === "") {
    throw new Error("rawJobInput is required");
  }

  const trimmedInput = state.rawJobInput.trim();
  if (!isUrl(trimmedInput)) {
    return { rawJobInput: state.rawJobInput };
  }

  const text = await fetchAndStripHtml(trimmedInput);
  return { rawJobInput: text };
};
