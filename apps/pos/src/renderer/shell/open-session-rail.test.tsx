import { describe, expect, it, onTestFinished } from "vitest";
import { page, userEvent } from "vitest/browser";
import { OpenSessionRail } from "./open-session-rail";
import { render } from "./test-support/render-with-router";

describe("OpenSessionRail", () => {
  it("marks Venta as current on the sale screen", async () => {
    const screen = await render(
      <OpenSessionRail firstName="Ada" registerName="Caja 1" lock={() => {}} current="sale" />,
    );

    await expect
      .element(screen.getByRole("button", { name: "Venta" }))
      .toHaveAttribute("aria-current", "page");
    await expect
      .element(screen.getByRole("link", { name: "Caja" }))
      .not.toHaveAttribute("aria-current");
  });

  it("marks Caja as current on the cash screens and sends Venta to the sale", async () => {
    const screen = await render(
      <OpenSessionRail firstName="Ada" registerName="Caja 1" lock={() => {}} current="cash" />,
    );

    await expect
      .element(screen.getByRole("link", { name: "Caja" }))
      .toHaveAttribute("aria-current", "page");
    const venta = screen.getByRole("link", { name: "Venta" });
    await expect.element(venta).not.toHaveAttribute("aria-current");
    expect(venta.element().getAttribute("href")).toBe("/session");
  });

  describe("Salir", () => {
    async function renderRail() {
      await page.viewport(1280, 900);
      onTestFinished(() => page.viewport(414, 896));
      const locked: string[] = [];
      const screen = await render(
        <OpenSessionRail
          firstName="Ada"
          registerName="Caja 1"
          lock={() => locked.push("locked")}
          current="sale"
        />,
      );
      return Object.assign(screen, { locked });
    }

    it("asks to close the register first instead of leaving", async () => {
      const screen = await renderRail();

      await userEvent.click(screen.getByRole("button", { name: "Salir" }));

      await expect
        .element(screen.getByRole("dialog", { name: "¿Cerrar la caja o dejarla bloqueada?" }))
        .toBeVisible();
      expect(screen.router.state.location.pathname).toBe("/");
    });

    it("keeps the session untouched when the modal is dismissed", async () => {
      const screen = await renderRail();
      await userEvent.click(screen.getByRole("button", { name: "Salir" }));

      await userEvent.keyboard("{Escape}");

      await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
      expect(screen.router.state.location.pathname).toBe("/");
      expect(screen.locked).toEqual([]);
    });

    it("leaves the register locked on Dejar bloqueada", async () => {
      const screen = await renderRail();
      await userEvent.click(screen.getByRole("button", { name: "Salir" }));

      await userEvent.click(screen.getByRole("button", { name: "Dejar bloqueada" }));

      expect(screen.locked).toEqual(["locked"]);
      await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    });

    it("goes to the cash count in leaving mode on Cerrar caja", async () => {
      const screen = await renderRail();
      await userEvent.click(screen.getByRole("button", { name: "Salir" }));

      await userEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));

      await expect.poll(() => screen.router.state.location.pathname).toBe("/cash-count");
      expect(screen.router.state.location.search).toEqual({ leaving: true });
    });
  });
});
