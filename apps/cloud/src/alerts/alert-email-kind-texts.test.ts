import { ALERT_KINDS, isEmailedAlertKind } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { alertEmailKindTexts } from "./alert-email-kind-texts.js";

describe("alertEmailKindTexts", () => {
  it.each(ALERT_KINDS.filter(isEmailedAlertKind))("gives %s a label and a description", (kind) => {
    const texts = alertEmailKindTexts(kind);

    expect(texts.label).not.toBe("");
    expect(texts.description).not.toBe("");
  });

  it("describes a changed recipient set without claiming someone started or stopped receiving alerts", () => {
    expect(alertEmailKindTexts("alert_recipients_changed")).toEqual({
      label: "Cambió quién recibe alertas por email",
      description: "Cambió quién recibe las alertas por email o cuáles recibe.",
    });
  });
});
