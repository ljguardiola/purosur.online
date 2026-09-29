import type { EnrollmentOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { EnrollmentScreen } from "./enrollment-screen";

const TYPED_CODE = "p4nx 7kwe 2qrt 6mzd";

function answering(outcome: EnrollmentOutcome | Error) {
  const codes: string[] = [];
  const enroll = async (typedCode: string) => {
    codes.push(typedCode);
    if (outcome instanceof Error) {
      throw outcome;
    }
    return outcome;
  };
  return { enroll, codes };
}

function pending() {
  const codes: string[] = [];
  let finish: (outcome: EnrollmentOutcome) => void = () => {};
  const enroll = (typedCode: string) => {
    codes.push(typedCode);
    return new Promise<EnrollmentOutcome>((resolve) => {
      finish = resolve;
    });
  };
  return { enroll, codes, finish: (outcome: EnrollmentOutcome) => finish(outcome) };
}

async function submitCode(screen: Awaited<ReturnType<typeof render>>, code = TYPED_CODE) {
  await userEvent.fill(screen.getByRole("textbox", { name: "Código de alta" }), code);
  await userEvent.click(screen.getByRole("button", { name: "Dar de alta" }));
}

describe("EnrollmentScreen", () => {
  it("asks for the enrollment code the backoffice issues", async () => {
    const screen = await render(
      <EnrollmentScreen enroll={answering({ kind: "enrolled" }).enroll} />,
    );

    await expect.element(screen.getByText("NOTEBOOK NUEVA")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "Dar de alta esta caja" }))
      .toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Escribí el código de alta que se genera en el backoffice, en Cajas registradoras. Vale 15 minutos y hace falta internet.",
        ),
      )
      .toBeVisible();
    await expect.element(screen.getByRole("textbox", { name: "Código de alta" })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Dar de alta" })).toBeEnabled();
    await expect.element(screen.getByText("Sin dar de alta")).toBeVisible();

    await expectNoAccessibilityViolations(screen.container);
  });

  it("redeems the code as it was typed, with or without spaces and in any case", async () => {
    const { enroll, codes } = answering({ kind: "enrolled" });
    const screen = await render(<EnrollmentScreen enroll={enroll} />);

    await submitCode(screen);

    expect(codes).toEqual([TYPED_CODE]);
  });

  it("redeems the code when Enter is pressed in the field", async () => {
    const { enroll, codes } = answering({ kind: "enrolled" });
    const screen = await render(<EnrollmentScreen enroll={enroll} />);

    await userEvent.fill(screen.getByRole("textbox", { name: "Código de alta" }), TYPED_CODE);
    await userEvent.keyboard("{Enter}");

    expect(codes).toEqual([TYPED_CODE]);
  });

  it("keeps the button disabled while the code is being redeemed, so it's sent only once", async () => {
    const request = pending();
    const screen = await render(<EnrollmentScreen enroll={request.enroll} />);

    await submitCode(screen);

    await expect.element(screen.getByRole("button", { name: "Dar de alta" })).toBeDisabled();
    request.finish({ kind: "code_rejected" });
    await expect.element(screen.getByRole("button", { name: "Dar de alta" })).toBeEnabled();
    expect(request.codes).toHaveLength(1);
  });

  it("shows that the code doesn't work, marking the field, when the cloud refuses it", async () => {
    const screen = await render(
      <EnrollmentScreen enroll={answering({ kind: "code_rejected" }).enroll} />,
    );

    await submitCode(screen);

    await expect.element(screen.getByText("El código ya no sirve")).toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Venció, ya se usó o se escribió mal varias veces. Pedí un código nuevo en el backoffice.",
        ),
      )
      .toBeVisible();
    await expect
      .element(screen.getByRole("textbox", { name: "Código de alta" }))
      .toHaveAttribute("aria-invalid", "true");
    await expect.element(screen.getByRole("button", { name: "Dar de alta" })).toBeEnabled();

    await expectNoAccessibilityViolations(screen.container);
  });

  it("says when to try again after too many attempts", async () => {
    const screen = await render(
      <EnrollmentScreen
        enroll={answering({ kind: "rate_limited", retry_after_seconds: 541 }).enroll}
      />,
    );

    await submitCode(screen);

    await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
    await expect
      .element(screen.getByText("Se puede volver a intentar en 10 minutos."))
      .toBeVisible();
  });

  it("says the notebook has no connection when the cloud can't be reached", async () => {
    const screen = await render(
      <EnrollmentScreen enroll={answering({ kind: "unreachable" }).enroll} />,
    );

    await submitCode(screen);

    await expect.element(screen.getByText("No hay conexión a internet")).toBeVisible();
    await expect
      .element(screen.getByText("Revisá que esta notebook esté conectada y probá de nuevo."))
      .toBeVisible();
  });

  it.each([
    ["the cloud is unavailable", { kind: "unavailable" } as const],
    ["the core can't answer", new Error("the core connection was replaced")],
  ])("says the alta couldn't be done when %s", async (_case, outcome) => {
    const screen = await render(<EnrollmentScreen enroll={answering(outcome).enroll} />);

    await submitCode(screen);

    await expect.element(screen.getByText("No se pudo dar de alta la caja")).toBeVisible();
    await expect
      .element(
        screen.getByText("Puro Sur no responde en este momento. Probá de nuevo en unos minutos."),
      )
      .toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Dar de alta" })).toBeEnabled();
  });

  it("says the alta couldn't be kept on this notebook when its credentials can't be stored", async () => {
    const screen = await render(
      <EnrollmentScreen enroll={answering({ kind: "not_stored" }).enroll} />,
    );

    await submitCode(screen);

    await expect
      .element(screen.getByText("No se pudo guardar el alta en esta notebook"))
      .toBeVisible();
    await expect
      .element(screen.getByText("Pedí un código nuevo en el backoffice y probá de nuevo."))
      .toBeVisible();
  });

  it.each([
    ["empty", ""],
    ["too short", "P4NX 7KWE 2QRT"],
    ["made of characters no code has", "P4NX 7KWE 2QRT 6MZ1"],
  ])("asks for the whole code without redeeming one that is %s", async (_case, code) => {
    const { enroll, codes } = answering({ kind: "enrolled" });
    const screen = await render(<EnrollmentScreen enroll={enroll} />);

    await submitCode(screen, code);

    await expect
      .element(screen.getByText("Escribí los 16 caracteres del código de alta."))
      .toBeVisible();
    expect(codes).toEqual([]);
  });

  it("clears the outcome of the last attempt when the code is redeemed again", async () => {
    const outcomes: EnrollmentOutcome[] = [{ kind: "unreachable" }, { kind: "code_rejected" }];
    const screen = await render(
      <EnrollmentScreen enroll={async () => outcomes.shift() ?? { kind: "enrolled" }} />,
    );

    await submitCode(screen);
    await expect.element(screen.getByText("No hay conexión a internet")).toBeVisible();
    await submitCode(screen);

    await expect.element(screen.getByText("El código ya no sirve")).toBeVisible();
    await expect.element(screen.getByText("No hay conexión a internet")).not.toBeInTheDocument();
  });
});
