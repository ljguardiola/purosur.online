import { ALERT_KINDS, alertKindPolicy } from "@purosur/domain";
import type { AlertEmail } from "@purosur/domain/alerts/use-cases";
import { describe, expect, it } from "vitest";
import { alertEmailContent } from "./alert-email-content.js";
import { alertEmailKindTexts } from "./alert-email-kind-texts.js";

const ORIGIN = "https://staging.purosur.online";

function email(overrides: Partial<AlertEmail> = {}): AlertEmail {
  return {
    deliveryId: "delivery-1",
    to: "ada@example.com",
    alertId: "alert-1",
    kind: "register_silent",
    stage: "opened",
    level: "warning",
    branchName: "Puro Sur",
    occurredAt: new Date("2026-10-01T15:30:00.000Z"),
    ...overrides,
  };
}

describe("alertEmailContent", () => {
  it.each([
    ["opened", "Alerta abierta: Caja sin sincronizar — Puro Sur"],
    ["escalated", "Alerta escalada a crítica: Caja sin sincronizar — Puro Sur"],
    ["resolved", "Alerta resuelta: Caja sin sincronizar — Puro Sur"],
  ] as const)("titles the %s stage's subject with the kind and the branch", (stage, subject) => {
    expect(alertEmailContent(email({ stage }), ORIGIN).subject).toBe(subject);
  });

  it("writes the kind's description, the level, the branch, when it opened and the link to the alert", () => {
    const { text } = alertEmailContent(email(), ORIGIN);

    expect(text).toBe(
      [
        "Una caja dejó de sincronizar",
        "",
        "Nivel: Advertencia",
        "Sucursal: Puro Sur",
        "Abierta el 01/10/2026 · 12:30",
        "",
        `Ver la alerta: ${ORIGIN}/?alert=alert-1`,
      ].join("\n"),
    );
  });

  it.each([
    ["opened", "Abierta el"],
    ["escalated", "Escalada el"],
    ["resolved", "Resuelta el"],
  ] as const)("says when the alert %s with the stage's own words", (stage, words) => {
    expect(alertEmailContent(email({ stage }), ORIGIN).text).toContain(
      `${words} 01/10/2026 · 12:30`,
    );
  });

  it.each([
    ["informational", "Informativa"],
    ["warning", "Advertencia"],
    ["critical", "Crítica"],
  ] as const)("names the %s level in Spanish", (level, name) => {
    expect(alertEmailContent(email({ level }), ORIGIN).text).toContain(`Nivel: ${name}`);
  });

  it("writes the time of the day in Argentina, whatever the time zone of the server", () => {
    const { text } = alertEmailContent(
      email({ occurredAt: new Date("2026-10-02T02:05:00.000Z") }),
      ORIGIN,
    );

    expect(text).toContain("Abierta el 01/10/2026 · 23:05");
  });

  it("carries the same facts in the HTML, with the link as a link", () => {
    const { html } = alertEmailContent(email(), ORIGIN);

    expect(html).toBe(
      "<p>Una caja dejó de sincronizar</p>" +
        "<p>Nivel: Advertencia<br>Sucursal: Puro Sur<br>Abierta el 01/10/2026 · 12:30</p>" +
        `<p>Ver la alerta: <a href="${ORIGIN}/?alert=alert-1">${ORIGIN}/?alert=alert-1</a></p>`,
    );
  });

  it("escapes what it writes into the HTML but not into the text", () => {
    const { text, html } = alertEmailContent(email({ branchName: 'Tienda <b>"A" & B' }), ORIGIN);

    expect(html).toContain("Sucursal: Tienda &lt;b&gt;&quot;A&quot; &amp; B");
    expect(text).toContain('Sucursal: Tienda <b>"A" & B');
  });

  it("refuses an alert of a kind that never goes by email", () => {
    expect(() => alertEmailContent(email({ kind: "lots_expiring" }), ORIGIN)).toThrow(
      "alert kind lots_expiring is not sent by email",
    );
  });
});

describe("the texts of the alerts sent by email", () => {
  const emailedKinds = ALERT_KINDS.filter((kind) => alertKindPolicy(kind).emailStages.length > 0);

  it("exist for exactly the kinds that go by email at some stage", () => {
    const textedKinds = ALERT_KINDS.filter((kind) => alertEmailKindTexts(kind) !== undefined);

    expect(textedKinds).toEqual(emailedKinds);
  });

  it.each(emailedKinds)("give %s a label and a description", (kind) => {
    const texts = alertEmailKindTexts(kind);

    expect(texts?.label).not.toBe("");
    expect(texts?.description).not.toBe("");
  });
});
