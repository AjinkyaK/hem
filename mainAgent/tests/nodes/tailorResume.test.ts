import { describe, it, expect } from "@jest/globals";
import { TailorOutputSchema } from "../../src/agent/types.js";

describe("TailorOutputSchema", () => {
  it("validates a complete valid TailorOutput object", () => {
    const result = TailorOutputSchema.safeParse({
      thinking: "Phase 1 reasoning here...",
      resume: "# Jane Doe\n\n## Professional summary\n...",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing thinking field", () => {
    const result = TailorOutputSchema.safeParse({
      resume: "# Resume",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing resume field", () => {
    const result = TailorOutputSchema.safeParse({
      thinking: "Reasoning",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-string thinking field", () => {
    const result = TailorOutputSchema.safeParse({
      thinking: 123,
      resume: "# Resume",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-string resume field", () => {
    const result = TailorOutputSchema.safeParse({
      thinking: "Reasoning",
      resume: { content: "# Resume" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts empty strings for both fields", () => {
    const result = TailorOutputSchema.safeParse({
      thinking: "",
      resume: "",
    });
    expect(result.success).toBe(true);
  });
});
