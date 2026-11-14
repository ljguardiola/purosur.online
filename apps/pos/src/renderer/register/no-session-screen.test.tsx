import type { OpenCashSessionOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import type { ReactNode } from "react";
import { describe, expect, expectTypeOf, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { gapBetweenSearchFieldAndScaleCard } from "../platform/test-support/search-row";
import type { SignedInPerson } from "../shell/signed-in-person";
import { render } from "../shell/test-support/render-with-router";
import type { NoSessionScreenProps } from "./no-session-screen";
import { NoSessionScreen } from "./no-session-screen";

const PERSON: SignedInPerson = {
  user_id: "u1",
  first_name: "Ada",
  abilities: ["view_sales_history"],
};

async function renderScreen({
  person = PERSON,
  offers,
}: {
  person?: SignedInPerson;
  offers?: ReactNode;
} = {}) {
  const signOut = vi.fn();
  const openCashSession = vi.fn(
    async (): Promise<OpenCashSessionOutcome> => ({ kind: "unavailable" }),
  );
  await page.viewport(1280, 900);
  onTestFinished(() => page.viewport(414, 896));
  const screen = await render(
    <NoSessionScreen
      person={person}
      signOut={signOut}
      openCashSession={openCashSession}
      readOpeningFloatSuggestion={async () => ({ kind: "none" })}
      offers={offers}
    />,
  );
  return { screen, signOut, openCashSession };
}

describe("NoSessionScreen", () => {
  it("names the screen for assistive technology without drawing a title", async () => {
    const { screen } = await renderScreen();

    await expect
      .element(screen.getByRole("heading", { level: 1, name: "¿Qué querés hacer?" }))
      .toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows the scan field inert and a locked card while nothing is offered", async () => {
    const { screen } = await renderScreen();

    const field = screen.getByRole("searchbox", { name: "Producto" });
    await expect.element(field).toBeVisible();
    await expect.element(field).toBeDisabled();
    await expect.element(field).toHaveAttribute("placeholder", "Escaneá o escribí el nombre");
    await expect
      .element(screen.getByRole("img", { name: "Caja sin sesión abierta" }))
      .toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows the balanza card beside the scan field, with no reading", async () => {
    const { screen } = await renderScreen();

    const field = screen.getByRole("searchbox", { name: "Producto" });
    const label = screen.getByText("Balanza", { exact: true });
    await expect.element(label).toBeVisible();
    expect(label.element().parentElement?.textContent).toBe("Balanza");
    const fieldBox = field.element().getBoundingClientRect();
    const cardBox = label.element().getBoundingClientRect();
    expect(gapBetweenSearchFieldAndScaleCard(field.element(), label.element())).toBe(12);
    expect(cardBox.top).toBeLessThan(fieldBox.bottom);
  });

  it("shows what the screen is given to offer in place of the scan field and the locked card", async () => {
    const { screen } = await renderScreen({ offers: <p>Una oferta</p> });

    await expect.element(screen.getByText("Una oferta")).toBeVisible();
    await expect.element(screen.getByText("Balanza", { exact: true })).not.toBeVisible();
    await expect
      .element(screen.getByRole("searchbox", { name: "Producto" }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("img", { name: "Caja sin sesión abierta" }))
      .not.toBeInTheDocument();
  });

  it("takes no register name, which the frame's header shows", () => {
    expectTypeOf<NoSessionScreenProps>().not.toHaveProperty("registerName");
  });

  it("shows only the first name of the person who is in", async () => {
    const { screen } = await renderScreen();

    await expect.element(screen.getByRole("heading", { name: "Ada" })).toBeVisible();
    expect(screen.container.textContent).not.toContain("void_sale");
  });

  it("offers only Inicio and Salir when no entry exists", async () => {
    const { screen } = await renderScreen({ person: { ...PERSON, abilities: [] } });

    const railItems = Array.from(
      screen
        .getByRole("navigation", { name: "Menú de la caja" })
        .element()
        .querySelectorAll("a, button"),
    ).map((item) => item.textContent);

    expect(railItems).toEqual(["Inicio", "Salir"]);
  });

  it("offers the entries the person's permissions unlock", async () => {
    const { screen } = await renderScreen();

    await expect.element(screen.getByRole("link", { name: "Historial" })).toBeVisible();
  });

  it("asks for confirmation before leaving, without signing out yet", async () => {
    const { screen, signOut } = await renderScreen();

    await userEvent.click(screen.getByRole("button", { name: "Salir" }));

    await expect
      .element(screen.getByRole("complementary", { name: "¿Salir de la caja?" }))
      .toBeVisible();
    expect(signOut).not.toHaveBeenCalled();
    await expectNoAccessibilityViolations(document.body);
  });

  it("signs out once leaving is confirmed", async () => {
    const { screen, signOut } = await renderScreen();
    await userEvent.click(screen.getByRole("button", { name: "Salir" }));

    await userEvent.click(
      screen
        .getByRole("complementary", { name: "¿Salir de la caja?" })
        .getByRole("button", { name: "Salir" }),
    );

    expect(signOut).toHaveBeenCalledOnce();
  });

  it("stays on the screen when the leaving panel is closed", async () => {
    const { screen, signOut } = await renderScreen();
    await userEvent.click(screen.getByRole("button", { name: "Salir" }));

    await userEvent.click(screen.getByRole("button", { name: "Cerrar con Esc" }));

    await expect
      .element(screen.getByRole("complementary", { name: "¿Salir de la caja?" }))
      .not.toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("offers to open the cash drawer only to a person who can sell and charge", async () => {
    const { screen } = await renderScreen();

    await expect
      .element(screen.getByRole("button", { name: "Abrir caja" }))
      .not.toBeInTheDocument();
  });

  it("opens the cash drawer for the person with the float suggested from the previous close", async () => {
    await page.viewport(1280, 900);
    onTestFinished(() => page.viewport(414, 896));
    const openCashSession = vi.fn(
      async (): Promise<OpenCashSessionOutcome> => ({ kind: "unavailable" }),
    );
    const screen = await render(
      <NoSessionScreen
        person={{ ...PERSON, abilities: ["open_cash_session"] }}
        signOut={vi.fn()}
        openCashSession={openCashSession}
        readOpeningFloatSuggestion={async () => ({
          kind: "previous_close",
          closed_at: "2026-11-04T20:14:00.000-03:00",
          counted_cash: 14_400_000,
        })}
      />,
    );

    await expect
      .element(screen.getByRole("textbox", { name: "Fondo inicial" }))
      .toHaveValue("144.000,00");
    await userEvent.click(screen.getByRole("button", { name: "Abrir caja" }));

    expect(openCashSession).toHaveBeenCalledExactlyOnceWith(14_400_000);
    await expectNoAccessibilityViolations(screen.container);
  });
});
