import type { RegisterAbility } from "@purosur/domain";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { NoSessionRail } from "./no-session-rail";
import type { SignedInPerson } from "./signed-in-person";
import { render } from "./test-support/render-with-router";

const EVERY_ENTRY: readonly RegisterAbility[] = [
  "view_sales_history",
  "configure_receipt_printer",
  "configure_serial_devices",
  "read_register_help",
];

function personWith(abilities: readonly RegisterAbility[]): SignedInPerson {
  return { user_id: "u1", first_name: "Ada", abilities: [...abilities] };
}

function railItems(screen: Awaited<ReturnType<typeof render>>) {
  return Array.from(
    screen
      .getByRole("navigation", { name: "Menú de la caja" })
      .element()
      .querySelectorAll("button, a"),
  ).map((item) => item.textContent);
}

describe("NoSessionRail", () => {
  it.each([
    [undefined, "Inicio"],
    ["/history", "Historial"],
    ["/receipt-printer", "Impresora"],
    ["/serial-devices", "Balanza y lector"],
    ["/help", "Ayuda"],
  ] as const)(
    "lists every entry the person may use on %s, with %s as the current one",
    async (current, open) => {
      const screen = await render(
        <NoSessionRail person={personWith(EVERY_ENTRY)} current={current} signOut={vi.fn()} />,
      );

      expect(railItems(screen)).toEqual([
        "Inicio",
        "Historial",
        "Impresora",
        "Balanza y lector",
        "Ayuda",
        "Salir",
      ]);
      const currentItems = Array.from(
        screen.container.querySelectorAll("[aria-current='page']"),
      ).map((item) => item.textContent);
      expect(currentItems).toEqual([open]);
    },
  );

  it("leaves out the entries the person may not use", async () => {
    const screen = await render(
      <NoSessionRail
        person={personWith(["read_register_help"])}
        current="/help"
        signOut={vi.fn()}
      />,
    );

    expect(railItems(screen)).toEqual(["Inicio", "Ayuda", "Salir"]);
  });

  it("sends Inicio home from any other screen", async () => {
    const screen = await render(
      <NoSessionRail person={personWith(EVERY_ENTRY)} current="/history" signOut={vi.fn()} />,
    );

    expect(screen.getByRole("link", { name: "Inicio" }).element().getAttribute("href")).toBe("/");
  });

  it("asks to confirm before signing out", async () => {
    const signOut = vi.fn();
    const screen = await render(<NoSessionRail person={personWith([])} signOut={signOut} />);

    await userEvent.click(screen.getByRole("navigation").getByRole("button", { name: "Salir" }));
    const dialog = screen.getByRole("dialog", { name: "¿Salir de la caja?" });
    await expect.element(dialog).toBeVisible();
    expect(signOut).not.toHaveBeenCalled();
    await userEvent.click(dialog.getByRole("button", { name: "Salir" }));

    expect(signOut).toHaveBeenCalledOnce();
  });
});
