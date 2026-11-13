import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { SignedInPerson } from "../shell/signed-in-person";
import { RegisterWindow } from "../shell/test-support/register-window";
import { render } from "../shell/test-support/render-with-router";
import { CashClosedScreen } from "./cash-closed-screen";
import type { ClosedCashSummary } from "./closed-cash-summary";
import { FLETE, OPENING } from "./test-support/cash-screen";

const PERSON: SignedInPerson = { user_id: "u1", first_name: "Ada", abilities: [] };
const SUMMARY: ClosedCashSummary = {
  session: {
    id: "s1",
    expected_cash: 14_420_000,
    counted_cash: 14_400_000,
    difference: -20_000,
    opened_at: "2026-11-04T08:02:00.000-03:00",
    closed_at: "2026-11-04T20:14:00.000-03:00",
  },
  movements: [OPENING, FLETE],
};

async function renderClosed(summary: ClosedCashSummary = SUMMARY) {
  await page.viewport(1366, 768);
  onTestFinished(() => page.viewport(414, 896));
  const lock = vi.fn();
  const onOpenCash = vi.fn();
  const screen = await render(
    <RegisterWindow>
      <CashClosedScreen person={PERSON} summary={summary} lock={lock} onOpenCash={onOpenCash} />
    </RegisterWindow>,
  );
  return { screen, lock, onOpenCash };
}

describe("CashClosedScreen", () => {
  it("is headed Caja cerrada and shows the counted cash as the hero figure", async () => {
    const { screen } = await renderClosed();

    await expect
      .element(screen.getByRole("heading", { name: "Caja cerrada", exact: true }))
      .toBeVisible();
    await expect.element(screen.getByText("CONTADO", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 144.000,00", { exact: true })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("lists the expected cash, the difference and when it opened and closed", async () => {
    const { screen } = await renderClosed();

    await expect.element(screen.getByText("Efectivo esperado", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 144.200,00", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Diferencia", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("– $ 200,00", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Abierta", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("04/11 · 08:02", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Cerrada", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("04/11 · 20:14", { exact: true })).toBeVisible();
  });

  it("shows a surplus with a plus sign and a match plainly", async () => {
    const surplus = await renderClosed({
      ...SUMMARY,
      session: { ...SUMMARY.session, difference: 30_000 },
    });
    await expect.element(surplus.screen.getByText("+ $ 300,00", { exact: true })).toBeVisible();
  });

  it("keeps the session's movements in the dimmed table", async () => {
    const { screen } = await renderClosed();

    await expect.element(screen.getByText("Flete", { exact: true })).toBeVisible();
    await expect
      .element(screen.getByRole("img", { name: "Movimientos bloqueados" }))
      .toBeInTheDocument();
  });

  it("offers Abrir caja with F12 and Salir with Enter", async () => {
    const { screen } = await renderClosed();

    await expect
      .element(screen.getByRole("button", { name: "Abrir caja" }))
      .toHaveTextContent("F12");
    await expect.element(screen.getByRole("button", { name: "Salir" })).toHaveTextContent("Enter");
  });

  it.each(["{F12}", "{Escape}"])("goes to open the cash with %s", async (key) => {
    const { onOpenCash, lock, screen } = await renderClosed();
    await expect.element(screen.getByRole("heading", { name: "Caja cerrada" })).toBeVisible();

    await userEvent.keyboard(key);

    expect(onOpenCash).toHaveBeenCalledOnce();
    expect(lock).not.toHaveBeenCalled();
  });

  it("goes to open the cash when Abrir caja is pressed", async () => {
    const { onOpenCash, screen } = await renderClosed();

    await userEvent.click(screen.getByRole("button", { name: "Abrir caja" }));

    expect(onOpenCash).toHaveBeenCalledOnce();
  });

  it("signs out with Enter and with the Salir button", async () => {
    const { lock, screen } = await renderClosed();
    await expect.element(screen.getByRole("heading", { name: "Caja cerrada" })).toBeVisible();

    await userEvent.keyboard("{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Salir" }));

    expect(lock).toHaveBeenCalledTimes(2);
  });
});
