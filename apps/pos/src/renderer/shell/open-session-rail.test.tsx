import type { ComponentProps } from "react";
import { describe, expect, expectTypeOf, it, onTestFinished } from "vitest";
import { page, userEvent } from "vitest/browser";
import { OpenSessionRail } from "./open-session-rail";
import { escapeHandled } from "./test-support/escape-handled";
import { render } from "./test-support/render-with-router";

describe("OpenSessionRail", () => {
  it("needs the person's abilities, so no screen can leave its entries out", () => {
    expectTypeOf<{
      lock: () => void;
      current: "cash";
    }>().not.toExtend<ComponentProps<typeof OpenSessionRail>>();
  });

  it("shows Venta, Historial, Devolver and Caja, and Salir last", async () => {
    const screen = await render(
      <OpenSessionRail lock={() => {}} current="sale" abilities={["view_sales_history"]} />,
    );

    const rail = screen.getByRole("navigation", { name: "Menú de la caja" }).element();
    const items = Array.from(rail.querySelectorAll("button, a")).map((item) => item.textContent);
    expect(items).toEqual(["Venta", "Historial", "Devolver", "Caja", "Salir"]);
  });

  it("draws Venta with a shopping cart", async () => {
    const screen = await render(<OpenSessionRail abilities={[]} lock={() => {}} current="sale" />);

    const icon = screen.getByRole("button", { name: "Venta" }).element().querySelector("svg");
    expect(icon?.classList.contains("lucide-shopping-cart")).toBe(true);
  });

  it("marks Venta as current on the sale screen", async () => {
    const screen = await render(<OpenSessionRail abilities={[]} lock={() => {}} current="sale" />);

    await expect
      .element(screen.getByRole("button", { name: "Venta" }))
      .toHaveAttribute("aria-current", "page");
    await expect
      .element(screen.getByRole("link", { name: "Caja" }))
      .not.toHaveAttribute("aria-current");
  });

  it("marks Caja as current on the cash screens and sends Venta to the sale", async () => {
    const screen = await render(<OpenSessionRail abilities={[]} lock={() => {}} current="cash" />);

    await expect
      .element(screen.getByRole("link", { name: "Caja" }))
      .toHaveAttribute("aria-current", "page");
    const venta = screen.getByRole("link", { name: "Venta" });
    await expect.element(venta).not.toHaveAttribute("aria-current");
    expect(venta.element().getAttribute("href")).toBe("/session");
  });

  it("sends Venta, Devolver and Caja to the no-session screen once the session is closed, keeping Caja current", async () => {
    const screen = await render(
      <OpenSessionRail abilities={[]} lock={() => {}} current="cash" sessionClosed />,
    );

    for (const entry of ["Venta", "Devolver", "Caja"]) {
      expect(screen.getByRole("link", { name: entry }).element().getAttribute("href")).toBe("/");
    }
    await expect
      .element(screen.getByRole("link", { name: "Caja" }))
      .toHaveAttribute("aria-current", "page");
  });

  it("goes back to the sale on Escape from another screen", async () => {
    const screen = await render(<OpenSessionRail abilities={[]} lock={() => {}} current="cash" />);
    await screen.router.navigate({ to: "/cash" });

    await userEvent.keyboard("{Escape}");

    await expect.poll(() => screen.router.state.location.pathname).toBe("/session");
  });

  it("goes back to the sale on Escape from the charge, though Venta is marked there", async () => {
    const screen = await render(<OpenSessionRail abilities={[]} lock={() => {}} current="sale" />);
    await screen.router.navigate({ to: "/charge" });

    await userEvent.keyboard("{Escape}");

    await expect.poll(() => screen.router.state.location.pathname).toBe("/session");
  });

  it("leaves Escape unhandled on the sale", async () => {
    const screen = await render(<OpenSessionRail abilities={[]} lock={() => {}} current="sale" />);
    await screen.router.navigate({ to: "/session" });
    const handled = escapeHandled();

    await userEvent.keyboard("{Escape}");

    expect(handled()).toBe(false);
    expect(screen.router.state.location.pathname).toBe("/session");
  });

  it("offers the sales history, between Venta and Caja, to a person who may view it", async () => {
    const screen = await render(
      <OpenSessionRail lock={() => {}} current="sale" abilities={["view_sales_history"]} />,
    );

    const history = screen.getByRole("link", { name: "Historial" });
    expect(history.element().getAttribute("href")).toBe("/history");
    const items = screen
      .getByRole("navigation", { name: "Menú de la caja" })
      .getByRole("button")
      .elements()
      .map((item) => item.textContent);
    expect(items).toEqual(["Venta", "Salir"]);
    const links = screen
      .getByRole("link")
      .elements()
      .map((item) => item.textContent);
    expect(links).toEqual(["Historial", "Devolver", "Caja"]);
  });

  it("offers the return to everyone, since someone with permission can authorize it", async () => {
    const screen = await render(<OpenSessionRail abilities={[]} lock={() => {}} current="sale" />);

    expect(screen.getByRole("link", { name: "Devolver" }).element().getAttribute("href")).toBe(
      "/return",
    );
  });

  it("marks Devolver as current on the return screen", async () => {
    const screen = await render(
      <OpenSessionRail abilities={[]} lock={() => {}} current="return" />,
    );

    await expect
      .element(screen.getByRole("link", { name: "Devolver" }))
      .toHaveAttribute("aria-current", "page");
    await expect
      .element(screen.getByRole("link", { name: "Caja" }))
      .not.toHaveAttribute("aria-current");
  });

  it("marks Historial as current on the sales history", async () => {
    const screen = await render(
      <OpenSessionRail lock={() => {}} current="history" abilities={["view_sales_history"]} />,
    );

    await expect
      .element(screen.getByRole("link", { name: "Historial" }))
      .toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Venta" }).element().getAttribute("href")).toBe(
      "/session",
    );
  });

  it("offers the deferred sale lookup, after the sales history, to a person who may invoice deferred sales", async () => {
    const screen = await render(
      <OpenSessionRail
        lock={() => {}}
        current="deferred_sale"
        abilities={["view_sales_history", "invoice_deferred_sale"]}
      />,
    );

    const deferredSale = screen.getByRole("link", { name: "Venta diferida" });
    expect(deferredSale.element().getAttribute("href")).toBe("/deferred-sale");
    await expect.element(deferredSale).toHaveAttribute("aria-current", "page");
    const links = screen
      .getByRole("link")
      .elements()
      .map((item) => item.textContent);
    expect(links).toEqual(["Venta", "Historial", "Venta diferida", "Devolver", "Caja"]);
  });

  it("offers no sales history to a person who may not view it", async () => {
    const screen = await render(
      <OpenSessionRail lock={() => {}} current="sale" abilities={["reprint_receipt"]} />,
    );

    await expect.element(screen.getByRole("link", { name: "Caja" })).toBeVisible();
    await expect.element(screen.getByRole("link", { name: "Historial" })).not.toBeInTheDocument();
  });

  it("offers the printer and the scale and reader, after Caja, to a person who may configure them", async () => {
    const screen = await render(
      <OpenSessionRail
        lock={() => {}}
        current="sale"
        abilities={["view_sales_history", "configure_receipt_printer", "configure_serial_devices"]}
      />,
    );

    const links = screen
      .getByRole("link")
      .elements()
      .map((item) => item.textContent);
    expect(links).toEqual(["Historial", "Devolver", "Caja", "Impresora", "Balanza y lector"]);
    expect(screen.getByRole("link", { name: "Impresora" }).element().getAttribute("href")).toBe(
      "/receipt-printer",
    );
    expect(
      screen.getByRole("link", { name: "Balanza y lector" }).element().getAttribute("href"),
    ).toBe("/serial-devices");
  });

  it("offers each device screen only to a person who may configure it", async () => {
    const screen = await render(
      <OpenSessionRail lock={() => {}} current="sale" abilities={["configure_serial_devices"]} />,
    );

    await expect.element(screen.getByRole("link", { name: "Balanza y lector" })).toBeVisible();
    await expect.element(screen.getByRole("link", { name: "Impresora" })).not.toBeInTheDocument();
  });

  it("marks Impresora as current on the printer screen", async () => {
    const screen = await render(
      <OpenSessionRail
        lock={() => {}}
        current="receipt_printer"
        abilities={["configure_receipt_printer", "configure_serial_devices"]}
      />,
    );

    await expect
      .element(screen.getByRole("link", { name: "Impresora" }))
      .toHaveAttribute("aria-current", "page");
    await expect
      .element(screen.getByRole("link", { name: "Balanza y lector" }))
      .not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Venta" }).element().getAttribute("href")).toBe(
      "/session",
    );
  });

  it("marks Balanza y lector as current on the serial devices screen", async () => {
    const screen = await render(
      <OpenSessionRail
        lock={() => {}}
        current="serial_devices"
        abilities={["configure_receipt_printer", "configure_serial_devices"]}
      />,
    );

    await expect
      .element(screen.getByRole("link", { name: "Balanza y lector" }))
      .toHaveAttribute("aria-current", "page");
    await expect
      .element(screen.getByRole("link", { name: "Impresora" }))
      .not.toHaveAttribute("aria-current");
  });

  it("ends with the scale and reader, with no help entry", async () => {
    const screen = await render(
      <OpenSessionRail
        lock={() => {}}
        current="sale"
        abilities={["view_sales_history", "configure_receipt_printer", "configure_serial_devices"]}
      />,
    );

    const links = screen
      .getByRole("link")
      .elements()
      .map((item) => item.textContent);
    expect(links).toEqual(["Historial", "Devolver", "Caja", "Impresora", "Balanza y lector"]);
  });

  describe("Salir", () => {
    async function renderRail() {
      await page.viewport(1280, 900);
      onTestFinished(() => page.viewport(414, 896));
      const locked: string[] = [];
      const screen = await render(
        <OpenSessionRail abilities={[]} lock={() => locked.push("locked")} current="sale" />,
      );
      return Object.assign(screen, { locked });
    }

    it("locks the register straight away, with no dialog to answer", async () => {
      const screen = await renderRail();

      await userEvent.click(screen.getByRole("button", { name: "Salir" }));

      expect(screen.locked).toEqual(["locked"]);
      await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    });

    it("stays on the screen it was on when it locks the register", async () => {
      const screen = await renderRail();

      await userEvent.click(screen.getByRole("button", { name: "Salir" }));

      expect(screen.router.state.location.pathname).toBe("/");
    });
  });
});
