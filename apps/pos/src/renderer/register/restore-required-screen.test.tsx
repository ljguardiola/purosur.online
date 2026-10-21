import type { EnrollmentOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { RestoreRequiredScreen } from "./restore-required-screen";

const TYPED_CODE = "p4nx 7kwe 2qrt 6mzd";

async function checkingLikeTheCore(typedCode: string): Promise<"code"[]> {
  return typedCode.replaceAll(" ", "").length === 16 ? [] : ["code"];
}

describe("RestoreRequiredScreen", () => {
  it("says the register has to be enrolled again and what it takes", async () => {
    const screen = await render(
      <RestoreRequiredScreen
        registerName="Caja 2"
        checkCode={checkingLikeTheCore}
        enroll={async () => ({ kind: "enrolled" })}
      />,
    );

    await expect.element(screen.getByText("CAJA 2")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "La caja tiene que volver a darse de alta" }))
      .toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Sus datos quedaron atrás de los de la nube, así que no puede vender hasta restaurarse.",
        ),
      )
      .toBeVisible();
    await expect.element(screen.getByText("Pedí un código de alta")).toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Un Administrador lo genera desde el backoffice. Las ventas guardadas en esta notebook se conservan.",
        ),
      )
      .toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Dar de alta la caja" })).toBeVisible();

    await expectNoAccessibilityViolations(screen.container);
  });

  it("names just the register when its name is not known", async () => {
    const screen = await render(
      <RestoreRequiredScreen
        registerName={null}
        checkCode={checkingLikeTheCore}
        enroll={async () => ({ kind: "enrolled" })}
      />,
    );

    await expect.element(screen.getByText("CAJA", { exact: true })).toBeVisible();
  });

  it("shows the enrollment form when asked to enroll the register", async () => {
    const screen = await render(
      <RestoreRequiredScreen
        registerName="Caja 2"
        checkCode={checkingLikeTheCore}
        enroll={async () => ({ kind: "enrolled" })}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Dar de alta la caja" }));

    await expect.element(screen.getByRole("textbox", { name: "Código de alta" })).toBeVisible();
  });

  it("enrolls the register with the typed code", async () => {
    const codes: string[] = [];
    const enroll = async (typedCode: string): Promise<EnrollmentOutcome> => {
      codes.push(typedCode);
      return { kind: "enrolled" };
    };
    const screen = await render(
      <RestoreRequiredScreen
        registerName="Caja 2"
        checkCode={checkingLikeTheCore}
        enroll={enroll}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Dar de alta la caja" }));
    await userEvent.fill(screen.getByRole("textbox", { name: "Código de alta" }), TYPED_CODE);
    await userEvent.click(screen.getByRole("button", { name: "Dar de alta" }));

    await expect.poll(() => codes).toEqual([TYPED_CODE]);
  });
});
