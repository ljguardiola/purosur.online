import type { StartupPending } from "@purosur/contracts";
import { expectNoAccessibilityViolations, tokenRgb } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { SignedInPerson } from "../shell/signed-in-person";
import { StartupPendingSessionPanel } from "./startup-pending-session-panel";

const OWNER: SignedInPerson = { user_id: "u2", first_name: "Grace", abilities: [] };
const OPENED_AT = "2026-09-30T09:02:00.000-03:00";
const SELLING_BLOCKED_REASON = "Pasá el cobro a reembolso para empezar a vender.";
const CHECKING_REASON = "Esperá a que la caja termine de consultar los cobros pagados.";

const KEPT_FROM_SELLING: StartupPending = {
  sales_to_print: [],
  unknown_fiscal_documents: [],
  pending_payments: [],
  paid_orders_without_sale: [],
  paid_order_discovery: "pending",
  selling_blocked: false,
  may_go_selling: false,
};

async function renderPanel(
  props: { openingFloat?: number | undefined; keptFromSelling?: StartupPending } = {},
) {
  await page.viewport(1280, 720);
  onTestFinished(() => page.viewport(414, 896));
  const onGoSelling = vi.fn();
  const screen = await render(
    <div style={{ display: "flex", height: "720px" }}>
      <StartupPendingSessionPanel
        sessionOwner={OWNER}
        openedAt={OPENED_AT}
        openingFloat={"openingFloat" in props ? props.openingFloat : 2_000_000}
        keptFromSelling={props.keptFromSelling}
        onGoSelling={onGoSelling}
      />
    </div>,
  );
  const panel = screen.getByRole("complementary", { name: "Sesión abierta" });
  return { screen, panel, onGoSelling };
}

function goSelling(panel: Awaited<ReturnType<typeof renderPanel>>["panel"]) {
  return panel.getByRole("button", { name: "Ir a vender" });
}

// React Aria opens a tooltip only after a real pointer move; a hover's enter event can fire
// before that move and is then silently dropped, so this throwaway move supplies it.
async function hoverGoSelling(panel: Awaited<ReturnType<typeof renderPanel>>["panel"]) {
  await cdp().send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
  await userEvent.hover(goSelling(panel));
}

describe("StartupPendingSessionPanel", () => {
  it("is headed Sesión abierta", async () => {
    const { panel } = await renderPanel();

    await expect.element(panel.getByRole("heading", { name: "Sesión abierta" })).toBeVisible();
  });

  it("names who opened the session, since when and with how much opening cash", async () => {
    const { panel } = await renderPanel();

    await expect.element(panel.getByText("Abierta por", { exact: true })).toBeVisible();
    await expect.element(panel.getByText("Grace", { exact: true })).toBeVisible();
    await expect.element(panel.getByText("Desde las", { exact: true })).toBeVisible();
    await expect.element(panel.getByText("09:02", { exact: true })).toBeVisible();
    await expect.element(panel.getByText("Fondo inicial", { exact: true })).toBeVisible();
    await expect.element(panel.getByText("$ 20.000,00", { exact: true })).toBeVisible();
  });

  it("shows who opened the session large and in the main text color", async () => {
    const { panel } = await renderPanel();
    const style = getComputedStyle(panel.getByText("Grace", { exact: true }).element());

    expect(style.fontSize).toBe("48px");
    expect(style.color).toBe(tokenRgb("text"));
  });

  it("gives only the opening time while the opening cash is unknown", async () => {
    const { panel } = await renderPanel({ openingFloat: undefined });

    await expect.element(panel.getByText("09:02", { exact: true })).toBeVisible();
    await expect.element(panel.getByText("Fondo inicial")).not.toBeInTheDocument();
  });

  it("goes selling from Ir a vender, which shows its Enter key", async () => {
    const { panel, onGoSelling } = await renderPanel();
    await expect.element(goSelling(panel).getByText("Enter", { exact: true })).toBeVisible();

    await userEvent.click(goSelling(panel));

    expect(onGoSelling).toHaveBeenCalledOnce();
  });

  it("locks Ir a vender while a paid order blocks selling, saying why in a notice and in its tooltip", async () => {
    const { panel, onGoSelling } = await renderPanel({
      keptFromSelling: { ...KEPT_FROM_SELLING, selling_blocked: true },
    });

    await expect.element(panel.getByRole("status")).toHaveTextContent(SELLING_BLOCKED_REASON);
    await expect.element(goSelling(panel)).toHaveAttribute("aria-disabled", "true");
    await hoverGoSelling(panel);
    await expect.element(page.getByRole("tooltip")).toHaveTextContent(SELLING_BLOCKED_REASON);
    goSelling(panel)
      .element()
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onGoSelling).not.toHaveBeenCalled();
  });

  it("locks Ir a vender while the paid orders are being checked, saying why only in its tooltip", async () => {
    const { panel, onGoSelling } = await renderPanel({ keptFromSelling: KEPT_FROM_SELLING });

    await expect.element(goSelling(panel)).toHaveAttribute("aria-disabled", "true");
    await expect.element(panel.getByText(CHECKING_REASON)).not.toBeInTheDocument();
    await hoverGoSelling(panel);
    await expect.element(page.getByRole("tooltip")).toHaveTextContent(CHECKING_REASON);
    goSelling(panel)
      .element()
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onGoSelling).not.toHaveBeenCalled();
  });

  it("has no accessibility violations", async () => {
    const { screen } = await renderPanel({
      keptFromSelling: { ...KEPT_FROM_SELLING, selling_blocked: true },
    });

    await expectNoAccessibilityViolations(screen.container);
  });
});
