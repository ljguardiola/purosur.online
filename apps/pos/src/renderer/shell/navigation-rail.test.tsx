import { AreaNavItem } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { Clock, History, ShoppingBasket, Wallet } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { ActionEntry } from "./action-entries";
import { NavigationRail } from "./navigation-rail";
import { expectDrawnLike } from "./test-support/drawn-like";
import { render } from "./test-support/render-with-router";

const HISTORY: ActionEntry = {
  label: "Historial",
  icon: History,
  ability: "view_sales_history",
  to: "/sign-in",
};
const CLOCK: ActionEntry = {
  label: "Reloj",
  icon: Clock,
  ability: "correct_register_clock",
  to: "/pin-code-redemption",
};

async function renderRail(
  props: { entries?: readonly ActionEntry[]; onSignOut?: () => void } = {},
) {
  return render(
    <NavigationRail entries={props.entries ?? []} onSignOut={props.onSignOut ?? vi.fn()} />,
  );
}

describe("NavigationRail", () => {
  it("lists Inicio, the entries and Salir, top to bottom", async () => {
    const screen = await renderRail({ entries: [HISTORY, CLOCK] });

    const rail = screen.getByRole("navigation", { name: "Menú de la caja" }).element();

    const items = Array.from(rail.querySelectorAll("button, a")).map((item) => item.textContent);
    expect(items).toEqual(["Inicio", "Historial", "Reloj", "Salir"]);
    expect(rail.textContent).not.toContain("Ada");
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

  it("links each entry to its route", async () => {
    const screen = await renderRail({ entries: [HISTORY, CLOCK] });

    const link = (name: string) => screen.getByRole("link", { name }).element();

    expect(link("Historial").getAttribute("href")).toBe("/sign-in");
    expect(link("Reloj").getAttribute("href")).toBe("/pin-code-redemption");
  });

  it("goes to an entry's route when it is pressed", async () => {
    const screen = await renderRail({ entries: [HISTORY] });

    await userEvent.click(screen.getByRole("link", { name: "Historial" }));

    expect(screen.router.state.location.pathname).toBe("/sign-in");
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
    const pathBefore = screen.router.state.location.pathname;

    await userEvent.click(screen.getByRole("button", { name: "Inicio" }));

    expect(onSignOut).not.toHaveBeenCalled();
    expect(screen.router.state.location.pathname).toBe(pathBefore);
    await expect
      .element(screen.getByRole("button", { name: "Inicio" }))
      .toHaveAttribute("aria-current", "page");
  });

  it("is 88px wide", async () => {
    const screen = await renderRail();

    const rail = screen.getByRole("navigation", { name: "Menú de la caja" }).element();

    expect(rail.getBoundingClientRect().width).toBe(88);
  });

  it("names the current screen after the one it is given instead of Inicio", async () => {
    const screen = await render(
      <NavigationRail entries={[]} home={{ label: "Venta", icon: ShoppingBasket }} />,
    );

    await expect
      .element(screen.getByRole("button", { name: "Venta" }))
      .toHaveAttribute("aria-current", "page");
    await expect.element(screen.getByRole("button", { name: "Inicio" })).not.toBeInTheDocument();
  });

  it("offers no Salir when it is given no way to sign out", async () => {
    const screen = await render(
      <NavigationRail entries={[]} home={{ label: "Venta", icon: ShoppingBasket }} />,
    );

    const rail = screen.getByRole("navigation", { name: "Menú de la caja" }).element();

    const items = Array.from(rail.querySelectorAll("button, a")).map((item) => item.textContent);
    expect(items).toEqual(["Venta"]);
    await expect.element(screen.getByText("Ada")).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("lists its links after the entries and marks the current one", async () => {
    const screen = await render(
      <NavigationRail
        entries={[]}
        home={{ label: "Venta", icon: ShoppingBasket }}
        links={[{ label: "Caja", icon: Wallet, to: "/cash", current: true }]}
      />,
    );

    const rail = screen.getByRole("navigation", { name: "Menú de la caja" }).element();

    const items = Array.from(rail.querySelectorAll("button, a")).map((item) => item.textContent);
    expect(items).toEqual(["Venta", "Caja"]);
    const caja = screen.getByRole("link", { name: "Caja" });
    await expect.element(caja).toHaveAttribute("aria-current", "page");
    expect(caja.element().getAttribute("href")).toBe("/cash");
  });

  it("leaves a link unmarked unless it is the current one", async () => {
    const screen = await render(
      <NavigationRail
        entries={[]}
        home={{ label: "Venta", icon: ShoppingBasket }}
        links={[{ label: "Caja", icon: Wallet, to: "/cash" }]}
      />,
    );

    await expect
      .element(screen.getByRole("link", { name: "Caja" }))
      .not.toHaveAttribute("aria-current");
  });

  it("goes to a link's route when it is pressed", async () => {
    const screen = await render(
      <NavigationRail
        entries={[]}
        home={{ label: "Venta", icon: ShoppingBasket }}
        links={[{ label: "Caja", icon: Wallet, to: "/cash" }]}
      />,
    );

    await userEvent.click(screen.getByRole("link", { name: "Caja" }));

    expect(screen.router.state.location.pathname).toBe("/cash");
  });

  it("turns the home item into a link, no longer current, when it is given a route", async () => {
    const screen = await render(
      <NavigationRail
        entries={[]}
        home={{ label: "Venta", icon: ShoppingBasket, to: "/session" }}
        links={[{ label: "Caja", icon: Wallet, to: "/cash", current: true }]}
      />,
    );

    const venta = screen.getByRole("link", { name: "Venta" });
    expect(venta.element().getAttribute("href")).toBe("/session");
    await expect.element(venta).not.toHaveAttribute("aria-current");
    await userEvent.click(venta);
    expect(screen.router.state.location.pathname).toBe("/session");
  });

  it("draws its links and buttons as the design system's light rail items, current or not", async () => {
    const screen = await render(
      <>
        <NavigationRail
          entries={[HISTORY]}
          home={{ label: "Venta", icon: ShoppingBasket }}
          links={[{ label: "Caja", icon: Wallet, to: "/cash", current: true }]}
          onSignOut={vi.fn()}
        />
        <AreaNavItem rail="light" label="Actual" icon={<Wallet />} active href="/current" />
        <AreaNavItem rail="light" label="Otro" icon={<History />} active={false} href="/other" />
      </>,
    );
    const item = (role: "link" | "button", name: string) =>
      screen.getByRole(role, { name }).element();
    const drawnItems = [
      { item: item("button", "Venta"), reference: item("link", "Actual"), label: "Venta" },
      { item: item("link", "Historial"), reference: item("link", "Otro"), label: "Historial" },
      { item: item("link", "Caja"), reference: item("link", "Actual"), label: "Caja" },
      { item: item("button", "Salir"), reference: item("link", "Otro"), label: "Salir" },
    ];

    for (const { item: drawn, reference, label } of drawnItems) {
      expectDrawnLike(
        drawn,
        reference,
        [
          "display",
          "flexDirection",
          "alignItems",
          "justifyContent",
          "width",
          "paddingTop",
          "paddingBottom",
          "borderRadius",
          "backgroundColor",
          "rowGap",
          "cursor",
          "transitionProperty",
          "transitionDuration",
        ],
        label,
      );
      const referenceLabel = reference.textContent ?? "";
      expectDrawnLike(
        screen.getByText(label, { exact: true }).element(),
        screen.getByText(referenceLabel, { exact: true }).element(),
        ["color", "fontSize", "fontWeight"],
        `${label} label`,
      );
      expectDrawnLike(
        drawn.querySelector("svg") as SVGSVGElement,
        reference.querySelector("svg") as SVGSVGElement,
        ["width", "height", "color"],
        `${label} icon`,
      );
    }
  });
});
