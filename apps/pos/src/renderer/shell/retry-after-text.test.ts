import { describe, expect, it } from "vitest";
import { retryAfterText } from "./retry-after-text";

describe("retryAfterText", () => {
  it.each([
    [0, "Se puede volver a intentar en 1 minuto."],
    [60, "Se puede volver a intentar en 1 minuto."],
    [61, "Se puede volver a intentar en 2 minutos."],
    [541, "Se puede volver a intentar en 10 minutos."],
  ])("says when to try again after %s seconds", (seconds, text) => {
    expect(retryAfterText(seconds)).toBe(text);
  });
});
