import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { Clock, History } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { ActionEntry } from "./action-entries";
import { NavigationRail } from "./navigation-rail";
import { render } from "./test-support/render-with-router";

const HISTORY: ActionEntry = {
  label: "Historial",
  icon: History,
  permission: "view_sales_history",
  to: "/sign-in",
};
const CLOCK: ActionEntry = {
  label: "Reloj",
  icon: Clock,
  permission: "correct_register_clock",
  to: "/pin-code-redemption",
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

    const items = Array.from(rail.querySelectorAll("button, a")).map((item) => item.textContent);
    expect(items).toEqual(["Inicio", "Historial", "Reloj", "Salir"]);
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
      .element(screen.getByRole("link", { name: "Historial" }))
      .not.toHaveAttribute("aria-current");
    await expect
      .element(screen.getByRole("button", { name: "Salir" }))
      .not.toHaveAttribute("aria-current");
  });

  it("shows the first name of the person in the register", async () => {
    const screen = await renderRail();

    await expect.element(screen.getByText("Ada")).toBeVisible();
  });

  it("links each entry to its route", async () => {
    const screen = await renderRail({ entries: [HISTORY, CLOCK] });

    const link = (name: string) => screen.getByRole("link", { name }).element();

    expect(link("Historial").getAttribute("href")).toBe("/sign-in");
    expect(link("Reloj").getAttribute("href")).toBe("/pin-code-redemption");
  });

  it("goes to an entry's route when it is pressed", async () => {
    const screen = await renderRail({ entries: [HISTORY] });

    await userEvent.click(screen.getByRole("link", { name: "Historial" }));

    expect(window.location.pathname).toBe("/sign-in");
  });

  it("asks to leave when Salir is pressed", async () => {
    const onSignOut = vi.fn();
    const screen = await renderRail({ onSignOut });

    await userEvent.click(screen.getByRole("button", { name: "Salir" }));

    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it("leaves everything as it is when Inicio is pressed", async () => {
    const onSignOut = vi.fn();
    const screen = await renderRail({ entries: [HISTORY], onSignOut });
    const pathBefore = window.location.pathname;

    await userEvent.click(screen.getByRole("button", { name: "Inicio" }));

    expect(onSignOut).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe(pathBefore);
    await expect
      .element(screen.getByRole("button", { name: "Inicio" }))
      .toHaveAttribute("aria-current", "page");
  });

  it("is 88px wide", async () => {
    const screen = await renderRail();

    const rail = screen.getByRole("navigation", { name: "Menú de la caja" }).element();

    expect(rail.getBoundingClientRect().width).toBe(88);
  });

  it("keeps a long name on one line inside the rail", async () => {
    const screen = await renderRail({ firstName: "Maximilianobartolomedelasantisimatrinidad" });

    const rail = screen.getByRole("navigation", { name: "Menú de la caja" }).element();
    const name = screen.getByText("Maximilianobartolomedelasantisimatrinidad").element();

    expect(rail.getBoundingClientRect().width).toBe(88);
    expect(rail.scrollWidth).toBeLessThanOrEqual(88);
    expect(name.scrollWidth).toBeGreaterThan(name.clientWidth);
    expect(getComputedStyle(name).textOverflow).toBe("ellipsis");
  });
});
