import type { OpenCashSessionOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { SignedInPerson } from "../shell/signed-in-person";
import { render } from "../shell/test-support/render-with-router";
import { NoSessionScreen } from "./no-session-screen";

const PERSON: SignedInPerson = {
  user_id: "u1",
  first_name: "Ada",
  abilities: ["view_sales_history"],
};

async function renderScreen({
  registerName = null,
  person = PERSON,
}: {
  registerName?: string | null;
  person?: SignedInPerson;
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
      registerName={registerName}
      signOut={signOut}
      openCashSession={openCashSession}
    />,
  );
  return { screen, signOut, openCashSession };
}

describe("NoSessionScreen", () => {
  it("asks what to do, with no session open", async () => {
    const { screen } = await renderScreen();

    await expect.element(screen.getByRole("heading", { name: "¿Qué querés hacer?" })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("names the register in the eyebrow", async () => {
    const { screen } = await renderScreen({ registerName: "Caja 1" });

    await expect.element(screen.getByText("Caja 1", { exact: true })).toBeVisible();
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
    await expect.element(screen.getByRole("link", { name: "Ayuda" })).not.toBeInTheDocument();
  });

  it("asks for confirmation before leaving, without signing out yet", async () => {
    const { screen, signOut } = await renderScreen();

    await userEvent.click(screen.getByRole("button", { name: "Salir" }));

    await expect.element(screen.getByRole("dialog", { name: "¿Salir de la caja?" })).toBeVisible();
    expect(signOut).not.toHaveBeenCalled();
    await expectNoAccessibilityViolations(document.body);
  });

  it("signs out once leaving is confirmed", async () => {
    const { screen, signOut } = await renderScreen();
    await userEvent.click(screen.getByRole("button", { name: "Salir" }));

    await userEvent.click(
      screen
        .getByRole("dialog", { name: "¿Salir de la caja?" })
        .getByRole("button", { name: "Salir" }),
    );

    expect(signOut).toHaveBeenCalledOnce();
  });

  it("stays on the screen when leaving is cancelled", async () => {
    const { screen, signOut } = await renderScreen();
    await userEvent.click(screen.getByRole("button", { name: "Salir" }));

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("offers to open the cash drawer only to a person who can sell and charge", async () => {
    const { screen } = await renderScreen();

    await expect
      .element(screen.getByRole("button", { name: "Abrir caja" }))
      .not.toBeInTheDocument();
  });

  it("opens the cash drawer for the person with the float they typed", async () => {
    await page.viewport(1280, 900);
    onTestFinished(() => page.viewport(414, 896));
    const openCashSession = vi.fn(
      async (): Promise<OpenCashSessionOutcome> => ({ kind: "unavailable" }),
    );
    const screen = await render(
      <NoSessionScreen
        person={{ ...PERSON, abilities: ["open_cash_session"] }}
        registerName={null}
        signOut={vi.fn()}
        openCashSession={openCashSession}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Abrir caja" }));
    await userEvent.fill(screen.getByRole("textbox", { name: "Fondo inicial" }), "150");
    await userEvent.click(screen.getByRole("button", { name: "Abrir la caja" }));

    expect(openCashSession).toHaveBeenCalledExactlyOnceWith(15_000);
    await expectNoAccessibilityViolations(screen.container);
  });
});
