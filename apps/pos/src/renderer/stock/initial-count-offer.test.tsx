import type { ReadInitialCountOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { SignedInPerson } from "../shell/signed-in-person";
import { render } from "../shell/test-support/render-with-router";
import { InitialCountOffer } from "./initial-count-offer";
import { deferred } from "./test-support/initial-count-screen";

const COUNTER: SignedInPerson = {
  user_id: "u1",
  first_name: "Ada",
  abilities: ["record_initial_inventory"],
};
const OTHER: SignedInPerson = { user_id: "u2", first_name: "Linus", abilities: [] };

async function renderOffer(
  read: () => Promise<ReadInitialCountOutcome>,
  person: SignedInPerson = COUNTER,
  beside: ReactNode = null,
) {
  await page.viewport(1280, 720);
  const readInitialCount = vi.fn(read);
  const screen = await render(
    <>
      {beside}
      <InitialCountOffer person={person} readInitialCount={readInitialCount} />
    </>,
  );
  return { screen, readInitialCount };
}

describe("InitialCountOffer", () => {
  it("offers to load the starting stock as the selected row of what to start with", async () => {
    const { screen } = await renderOffer(async () => ({ kind: "read", offered: true, lines: [] }));

    const list = screen.getByRole("table", { name: "Para empezar" });
    await expect.element(list.getByRole("columnheader", { name: "Para empezar" })).toBeVisible();
    const row = list.getByRole("row", { name: /Inventario inicial/ });
    await expect.element(row).toBeVisible();
    await expect.element(row).toHaveAttribute("aria-current", "true");
    await expect
      .element(row.getByText("Cargar el stock con el que arranca el local"))
      .toBeVisible();
    await expect.element(screen.getByText("N", { exact: true })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("opens the initial count screen with N", async () => {
    const { screen } = await renderOffer(async () => ({ kind: "read", offered: true, lines: [] }));
    await expect.element(screen.getByRole("table", { name: "Para empezar" })).toBeVisible();

    await userEvent.keyboard("n");

    await expect.poll(() => screen.router.state.location.pathname).toBe("/initial-count");
  });

  it("opens the initial count screen with N while typing in another field", async () => {
    const { screen } = await renderOffer(
      async () => ({ kind: "read", offered: true, lines: [] }),
      COUNTER,
      <input aria-label="Fondo inicial" inputMode="decimal" />,
    );
    await expect.element(screen.getByRole("table", { name: "Para empezar" })).toBeVisible();
    await userEvent.click(screen.getByRole("textbox", { name: "Fondo inicial" }));

    await userEvent.keyboard("n");

    await expect.poll(() => screen.router.state.location.pathname).toBe("/initial-count");
  });

  it("opens the initial count screen when its row is pressed", async () => {
    const { screen } = await renderOffer(async () => ({ kind: "read", offered: true, lines: [] }));

    await userEvent.click(screen.getByRole("row", { name: /Inventario inicial/ }));

    await expect.poll(() => screen.router.state.location.pathname).toBe("/initial-count");
  });

  it("offers nothing to a person who may not load the count, without asking the core", async () => {
    const { screen, readInitialCount } = await renderOffer(
      async () => ({ kind: "read", offered: true, lines: [] }),
      OTHER,
    );

    await expect.element(screen.getByText("Inventario inicial")).not.toBeInTheDocument();
    expect(readInitialCount).not.toHaveBeenCalled();
  });

  it("offers nothing once the count is no longer offered", async () => {
    const { screen, readInitialCount } = await renderOffer(async () => ({
      kind: "read",
      offered: false,
      lines: [],
    }));

    await vi.waitFor(() => expect(readInitialCount).toHaveBeenCalled());
    await expect.element(screen.getByText("Inventario inicial")).not.toBeInTheDocument();
  });

  it("offers nothing while the core has not answered", async () => {
    const pending = deferred<ReadInitialCountOutcome>();
    const { screen } = await renderOffer(() => pending.promise);

    await expect.element(screen.getByText("Inventario inicial")).not.toBeInTheDocument();
  });

  it.each<ReadInitialCountOutcome>([
    { kind: "unavailable" },
    { kind: "not_permitted" },
    { kind: "not_signed_in" },
  ])("offers nothing when the core answers $kind", async (outcome) => {
    const { screen, readInitialCount } = await renderOffer(async () => outcome);

    await vi.waitFor(() => expect(readInitialCount).toHaveBeenCalled());
    await expect.element(screen.getByText("Inventario inicial")).not.toBeInTheDocument();
  });
});
