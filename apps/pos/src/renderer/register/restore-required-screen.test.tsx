import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render as renderInBrowser } from "vitest-browser-react";
import { KeyLayerProvider } from "../platform/key-layer";
import { RestoreRequiredScreen } from "./restore-required-screen";

function render(ui: ReactElement) {
  return renderInBrowser(<KeyLayerProvider>{ui}</KeyLayerProvider>);
}

describe("RestoreRequiredScreen", () => {
  it("says the register has to be enrolled again and what it takes", async () => {
    const screen = await render(
      <RestoreRequiredScreen registerName="Caja 2" version={null} onEnroll={() => {}} />,
    );

    await expect.element(screen.getByText("CAJA 2")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "La caja tiene que volver a darse de alta" }))
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

  it("does not explain that the register fell behind the cloud", async () => {
    const screen = await render(
      <RestoreRequiredScreen registerName="Caja 2" version={null} onEnroll={() => {}} />,
    );

    await expect
      .element(screen.getByText(/Sus datos quedaron atrás de los de la nube/))
      .not.toBeInTheDocument();
  });

  it("names just the register when its name is not known", async () => {
    const screen = await render(
      <RestoreRequiredScreen registerName={null} version={null} onEnroll={() => {}} />,
    );

    await expect.element(screen.getByText("CAJA", { exact: true })).toBeVisible();
  });

  it("shows only the register's version under the brand", async () => {
    const screen = await render(
      <RestoreRequiredScreen registerName="Caja 2" version="1.4.212" onEnroll={() => {}} />,
    );

    const footer = screen.container.querySelector("footer") as HTMLElement;
    expect(footer.textContent).toBe("Versión 1.4.212");
  });

  it("shows the Enter key on the button that enrolls, and no other key", async () => {
    const screen = await render(
      <RestoreRequiredScreen registerName="Caja 2" version={null} onEnroll={() => {}} />,
    );

    const button = screen
      .getByRole("button", { name: "Dar de alta la caja" })
      .element() as HTMLElement;
    expect(button.querySelector("kbd")?.textContent).toBe("Enter");
    const keys = Array.from(screen.container.querySelectorAll("kbd"), (key) => key.textContent);
    expect(keys).toEqual(["Enter"]);
  });

  it("asks to enroll the register again with Enter, once", async () => {
    const enroll = vi.fn();
    await render(<RestoreRequiredScreen registerName="Caja 2" version={null} onEnroll={enroll} />);

    await userEvent.keyboard("{Enter}");

    expect(enroll).toHaveBeenCalledOnce();
  });

  it("asks to enroll the register again when its button is pressed", async () => {
    const enroll = vi.fn();
    const screen = await render(
      <RestoreRequiredScreen registerName="Caja 2" version={null} onEnroll={enroll} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Dar de alta la caja" }));

    expect(enroll).toHaveBeenCalledOnce();
  });
});
