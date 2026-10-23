import { fiscalTaskClosingBodySchema } from "@purosur/contracts";
import { expect, test } from "vitest";
import {
  EMPTY_FISCAL_TASK_CLOSING_FORM,
  fiscalTaskClosingNoteMessage,
  fiscalTaskClosingRequestFrom,
} from "./fiscal-task-closing-form";

test("starts with no note", () => {
  expect(EMPTY_FISCAL_TASK_CLOSING_FORM).toEqual({ note: "" });
});

test("builds the request with the note the person typed", () => {
  const request = fiscalTaskClosingRequestFrom({ note: "Regularizada con el contador" });

  expect(fiscalTaskClosingBodySchema.parse(request)).toEqual({
    note: "Regularizada con el contador",
  });
});

test("asks for the note when it is blank", () => {
  expect(fiscalTaskClosingNoteMessage({ note: "   " })).toBe("Contá cómo se regularizó la tarea.");
});

test("says the note is too long when it has text", () => {
  expect(fiscalTaskClosingNoteMessage({ note: "a".repeat(501) })).toBe(
    "Ese texto es demasiado largo.",
  );
});
