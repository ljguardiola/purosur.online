import type { ReadInitialCountOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
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
) {
  await page.viewport(1280, 720);
  const readInitialCount = vi.fn(read);
  const screen = await render(
    <InitialCountOffer person={person} readInitialCount={readInitialCount} />,
  );
  return { screen, readInitialCount };
}

describe("InitialCountOffer", () => {
  it("offers to load the starting stock while the count is offered", async () => {
    const { screen } = await renderOffer(async () => ({ kind: "read", offered: true, lines: [] }));

    await expect.element(screen.getByText("Inventario inicial")).toBeVisible();
    await expect
      .element(screen.getByText("Cargar el stock con el que arranca el local."))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Cargar el inventario" }))
      .toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("opens the initial count screen", async () => {
    const { screen } = await renderOffer(async () => ({ kind: "read", offered: true, lines: [] }));

    await userEvent.click(screen.getByRole("button", { name: "Cargar el inventario" }));

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
