import type { OpenCashSessionOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { History } from "lucide-react";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { ActionEntry } from "../shell/action-entries";
import type { SignedInPerson } from "../shell/signed-in-person";
import { render } from "../shell/test-support/render-with-router";
import { NoSessionScreen } from "./no-session-screen";

const PERSON: SignedInPerson = {
  user_id: "u1",
  first_name: "Ada",
  abilities: ["view_sales_history"],
};

const HISTORY: ActionEntry = {
  label: "Historial",
  icon: History,
  ability: "view_sales_history",
  to: "/sign-in",
};
const REPRINT: ActionEntry = {
  label: "Reimprimir",
  icon: History,
  ability: "reprint_receipt",
  to: "/sign-in",
};

async function renderScreen(
  entries: readonly ActionEntry[] = [],
  signOut = vi.fn(),
  registerName: string | null = null,
  openCashSession = vi.fn(async (): Promise<OpenCashSessionOutcome> => ({ kind: "unavailable" })),
) {
  await page.viewport(1280, 900);
  onTestFinished(() => page.viewport(414, 896));
  const screen = await render(
    <NoSessionScreen
      person={PERSON}
      registerName={registerName}
      entries={entries}
      signOut={signOut}
      openCashSession={openCashSession}
    />,
  );
  return { screen, signOut, openCashSession };
}

describe("NoSessionScreen", () => {
  it("asks what to do, with no session open", async () => {
    const { screen } = await renderScreen();

    await expect.element(screen.getByText("Sin sesión abierta")).toBeVisible();
    await expect.element(screen.getByRole("heading", { name: "¿Qué querés hacer?" })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("names the register in the eyebrow", async () => {
    const { screen } = await renderScreen([], vi.fn(), "Caja 1");

    await expect.element(screen.getByText("Caja 1 · Sin sesión abierta")).toBeVisible();
  });

  it("shows only the first name of the person who is in", async () => {
    const { screen } = await renderScreen();

    await expect.element(screen.getByRole("navigation").getByText("Ada")).toBeVisible();
    await expect.element(screen.getByRole("heading", { name: "Ada" })).toBeVisible();
    expect(screen.container.textContent).not.toContain("void_sale");
  });

  it("offers only Inicio and Salir when no entry exists", async () => {
    const { screen } = await renderScreen();

    const buttons = Array.from(screen.container.querySelectorAll("button")).map(
      (button) => button.textContent,
    );

    expect(buttons).toEqual(["Inicio", "Salir"]);
  });

  it("offers the entries the person's permissions unlock, and no others", async () => {
    const { screen } = await renderScreen([HISTORY, REPRINT]);

    await expect.element(screen.getByRole("link", { name: "Historial" })).toBeVisible();
    await expect.element(screen.getByRole("link", { name: "Reimprimir" })).not.toBeInTheDocument();
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
        entries={[]}
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
