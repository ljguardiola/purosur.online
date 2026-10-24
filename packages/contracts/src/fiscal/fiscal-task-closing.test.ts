import { FISCAL_TASK_CLOSING_NOTE_MAX_LENGTH } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { fiscalTaskClosingBodySchema } from "./fiscal-task-closing.js";

const noteFailure = {
  field: "note",
  message: `note must be a non-empty string of at most ${FISCAL_TASK_CLOSING_NOTE_MAX_LENGTH} characters`,
};

function firstFailure(body: unknown): { field: unknown; message: string | undefined } | undefined {
  const result = fiscalTaskClosingBodySchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { field: issue.path[0], message: issue.message };
}

describe("fiscalTaskClosingBodySchema", () => {
  it("reads the note, trimmed", () => {
    expect(
      fiscalTaskClosingBodySchema.parse({ note: "  Regularized with the accountant " }),
    ).toEqual({ note: "Regularized with the accountant" });
  });

  it("accepts a note of the maximum length", () => {
    const note = "a".repeat(FISCAL_TASK_CLOSING_NOTE_MAX_LENGTH);

    expect(fiscalTaskClosingBodySchema.parse({ note })).toEqual({ note });
  });

  it("refuses a note longer than the maximum", () => {
    expect(firstFailure({ note: "a".repeat(FISCAL_TASK_CLOSING_NOTE_MAX_LENGTH + 1) })).toEqual(
      noteFailure,
    );
  });

  it.each([
    ["an empty note", { note: "" }],
    ["a blank note", { note: "   " }],
    ["no note", {}],
    ["a note that is not text", { note: 42 }],
  ])("refuses %s", (_case, body) => {
    expect(firstFailure(body)).toEqual(noteFailure);
  });
});
