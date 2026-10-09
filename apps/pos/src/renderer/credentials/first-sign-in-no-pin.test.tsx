import type { FirstPinCodeRequestOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { FirstSignInNoPin } from "./first-sign-in-no-pin";

const ADA = { id: "u1", first_name: "Ada" };
const ASK = "Mandarme un código por correo";

async function renderNoPin(request: (userId: string) => Promise<FirstPinCodeRequestOutcome>) {
  const sent: string[] = [];
  const screen = await render(
    <FirstSignInNoPin
      person={ADA}
      requestCode={request}
      onSent={() => {
        sent.push("sent");
      }}
    />,
  );
  return { screen, sent };
}

function answering(outcome: FirstPinCodeRequestOutcome | Error) {
  return async () => {
    if (outcome instanceof Error) {
      throw outcome;
    }
    return outcome;
  };
}

describe("FirstSignInNoPin", () => {
  it("names the person, says they have no PIN yet and offers a code by email or going back", async () => {
    const { screen } = await renderNoPin(answering({ kind: "sent" }));

    await expect.element(screen.getByText("Ada", { exact: true })).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "No tenés PIN todavía" }))
      .toBeVisible();
    await expect.element(screen.getByRole("button", { name: ASK })).toBeEnabled();
    const back = screen.getByRole("link", { name: "Volver" });
    expect(back.element().getAttribute("href")).toBe("/sign-in");
    await expectNoAccessibilityViolations(screen.container);
  });

  it("asks for the code of the person and lets the flow go on once it was sent", async () => {
    const asked: string[] = [];
    const { screen, sent } = await renderNoPin(async (userId) => {
      asked.push(userId);
      return { kind: "sent" };
    });

    await userEvent.click(screen.getByRole("button", { name: ASK }));

    await expect.poll(() => sent).toEqual(["sent"]);
    expect(asked).toEqual(["u1"]);
  });

  it("keeps the button disabled while the request is pending, so it is sent only once", async () => {
    let finish: (outcome: FirstPinCodeRequestOutcome) => void = () => {};
    const asked: string[] = [];
    const { screen } = await renderNoPin((userId) => {
      asked.push(userId);
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    await userEvent.click(screen.getByRole("button", { name: ASK }));

    await expect.element(screen.getByRole("button", { name: ASK })).toBeDisabled();
    finish({ kind: "unavailable" });
    await expect.element(screen.getByRole("button", { name: ASK })).toBeEnabled();
    expect(asked).toHaveLength(1);
  });

  it.each([
    [
      "pin_already_set",
      { kind: "pin_already_set" },
      "Ya tenés PIN",
      "Volvé al inicio y entrá con tu PIN.",
    ],
    [
      "not_found",
      { kind: "not_found" },
      "No encontramos tu usuario",
      "Puede que ya no tenga acceso a esta sucursal. Consultá con quien administra los usuarios.",
    ],
    [
      "rate_limited",
      { kind: "rate_limited", retry_after_seconds: 541 },
      "Demasiadas solicitudes",
      "Se puede volver a intentar en 10 minutos.",
    ],
    [
      "unreachable",
      { kind: "unreachable" },
      "Sin conexión a internet",
      "El código se manda en línea. Cuando vuelva la conexión se puede pedir.",
    ],
    [
      "unavailable",
      { kind: "unavailable" },
      "No se pudo pedir el código",
      "Puro Sur no responde en este momento. Probá de nuevo en unos minutos.",
    ],
    [
      "a core that can't answer",
      new Error("the core connection was replaced"),
      "No se pudo pedir el código",
      "Puro Sur no responde en este momento. Probá de nuevo en unos minutos.",
    ],
  ] as const)(
    "says why no code was sent on %s and stays put",
    async (_case, outcome, title, detail) => {
      const { screen, sent } = await renderNoPin(answering(outcome));
      await userEvent.click(screen.getByRole("button", { name: ASK }));

      await expect.element(screen.getByText(title)).toBeVisible();
      await expect.element(screen.getByText(detail)).toBeVisible();
      await expect.element(screen.getByRole("button", { name: ASK })).toBeEnabled();
      expect(sent).toEqual([]);
      await expectNoAccessibilityViolations(screen.container);
    },
  );

  it("clears the last refusal when the code is asked for again", async () => {
    const outcomes: FirstPinCodeRequestOutcome[] = [{ kind: "unreachable" }, { kind: "not_found" }];
    const { screen } = await renderNoPin(async () => outcomes.shift() ?? { kind: "sent" });
    await userEvent.click(screen.getByRole("button", { name: ASK }));
    await expect.element(screen.getByText("Sin conexión a internet")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: ASK }));

    await expect.element(screen.getByText("No encontramos tu usuario")).toBeVisible();
    await expect.element(screen.getByText("Sin conexión a internet")).not.toBeInTheDocument();
  });
});
