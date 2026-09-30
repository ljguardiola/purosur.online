import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { Clock, History } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { ActionEntry } from "./action-entries";
import { NavigationRail } from "./navigation-rail";

const HISTORY: ActionEntry = {
  label: "Historial",
  icon: History,
  permission: "view_sales_history",
  opens: vi.fn(),
};
const CLOCK: ActionEntry = {
  label: "Reloj",
  icon: Clock,
  permission: "sell_and_charge",
  opens: vi.fn(),
};

async function renderRail(
  props: { firstName?: string; entries?: readonly ActionEntry[]; onSignOut?: () => void } = {},
) {
  return render(
    <NavigationRail
      firstName={props.firstName ?? "Ada"}
      entries={props.entries ?? []}
      onSignOut={props.onSignOut ?? vi.fn()}
    />,
  );
}

describe("NavigationRail", () => {
  it("lists Inicio, the entries, the first name and Salir, top to bottom", async () => {
    const screen = await renderRail({ entries: [HISTORY, CLOCK] });

    const rail = screen.getByRole("navigation", { name: "Menú de la caja" }).element();

    const buttons = Array.from(rail.querySelectorAll("button")).map((button) => button.textContent);
    expect(buttons).toEqual(["Inicio", "Historial", "Reloj", "Salir"]);
    const text = rail.textContent ?? "";
    expect(text.indexOf("Reloj")).toBeLessThan(text.indexOf("Ada"));
    expect(text.indexOf("Ada")).toBeLessThan(text.indexOf("Salir"));
    await expectNoAccessibilityViolations(screen.container);
  });

  it("marks Inicio as the current screen and no other item", async () => {
    const screen = await renderRail({ entries: [HISTORY] });

    await expect
      .element(screen.getByRole("button", { name: "Inicio" }))
      .toHaveAttribute("aria-current", "page");
    await expect
      .element(screen.getByRole("button", { name: "Historial" }))
      .not.toHaveAttribute("aria-current");
    await expect
      .element(screen.getByRole("button", { name: "Salir" }))
      .not.toHaveAttribute("aria-current");
  });

  it("shows the first name of the person in the register", async () => {
    const screen = await renderRail();

    await expect.element(screen.getByText("Ada")).toBeVisible();
  });

  it("opens an entry when it is pressed", async () => {
    const opens = vi.fn();
    const screen = await renderRail({ entries: [{ ...HISTORY, opens }] });

    await userEvent.click(screen.getByRole("button", { name: "Historial" }));

    expect(opens).toHaveBeenCalledOnce();
  });

  it("asks to leave when Salir is pressed", async () => {
    const onSignOut = vi.fn();
    const screen = await renderRail({ onSignOut });

    await userEvent.click(screen.getByRole("button", { name: "Salir" }));

    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it("leaves everything as it is when Inicio is pressed", async () => {
    const onSignOut = vi.fn();
    const opens = vi.fn();
    const screen = await renderRail({ entries: [{ ...HISTORY, opens }], onSignOut });

    await userEvent.click(screen.getByRole("button", { name: "Inicio" }));

    expect(onSignOut).not.toHaveBeenCalled();
    expect(opens).not.toHaveBeenCalled();
    await expect
      .element(screen.getByRole("button", { name: "Inicio" }))
      .toHaveAttribute("aria-current", "page");
  });

  it("is 88px wide", async () => {
    const screen = await renderRail();

    const rail = screen.getByRole("navigation", { name: "Menú de la caja" }).element();

    expect(rail.getBoundingClientRect().width).toBe(88);
  });

  it("keeps a long name inside the rail", async () => {
    const screen = await renderRail({
      firstName: "Maximiliano-Bartolomé-de-la-Santísima-Trinidad",
    });

    const rail = screen.getByRole("navigation", { name: "Menú de la caja" }).element();

    expect(rail.getBoundingClientRect().width).toBe(88);
    expect(rail.scrollWidth).toBeLessThanOrEqual(88);
  });
});
