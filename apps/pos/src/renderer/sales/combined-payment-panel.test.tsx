import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { ChargeMethod } from "./charge-method-options";
import type { CombinedPaymentPanelProps } from "./combined-payment-panel";
import { CombinedPaymentPanel } from "./combined-payment-panel";

const ALL_ENABLED: ReadonlySet<ChargeMethod> = new Set([
  "CASH",
  "POINT_DEBIT",
  "POINT_CREDIT",
  "QR",
  "TRANSFER",
  "STANDALONE_TERMINAL",
]);

async function renderPanel(props: Partial<CombinedPaymentPanelProps> = {}) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const onChoose = vi.fn();
  const onChooseOther = vi.fn();
  const screen = await render(
    <CombinedPaymentPanel
      total={2_519_250}
      paid={1_000_000}
      pending={1_519_250}
      enabled={ALL_ENABLED}
      belowMinimum={undefined}
      cancelledNotice={false}
      paidOrderNotice={null}
      onChoose={onChoose}
      onChooseOther={onChooseOther}
      {...props}
    />,
  );
  return { screen, onChoose, onChooseOther };
}

describe("CombinedPaymentPanel", () => {
  it("shows what is missing, the total and what is paid", async () => {
    const { screen } = await renderPanel();

    await expect.element(screen.getByText("FALTA")).toBeVisible();
    await expect.element(screen.getByText("$ 15.192,50")).toBeVisible();
    await expect.element(screen.getByText("Total")).toBeVisible();
    await expect.element(screen.getByText("$ 25.192,50")).toBeVisible();
    await expect.element(screen.getByText("Pagado")).toBeVisible();
    await expect.element(screen.getByText("– $ 10.000,00").first()).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows no paid row, and no header, before anything is paid", async () => {
    const { screen } = await renderPanel({ paid: 0, pending: 2_519_250 });

    await expect.element(screen.getByText("Pagado")).not.toBeInTheDocument();
    await expect.element(screen.getByRole("heading")).not.toBeInTheDocument();
    await expect.element(screen.getByText("$ 25.192,50").first()).toBeVisible();
  });

  it("offers cash, the terminal by debit and by credit, the QR and the other methods, each with its key", async () => {
    const { screen } = await renderPanel();

    await expect.element(screen.getByRole("button", { name: "Cobrar en efectivo" })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Point débito" })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Point crédito" })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "QR" })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Otros medios" })).toBeVisible();
    const keys = [...screen.container.querySelectorAll("kbd")].map((key) => key.textContent);
    expect(keys).toEqual(["F12", "F9", "F10", "F11", "F1"]);
  });

  it.each([
    ["F12", "CASH"],
    ["F9", "POINT_DEBIT"],
    ["F10", "POINT_CREDIT"],
    ["F11", "QR"],
  ])("starts the method of %s with its key", async (key, method) => {
    const { onChoose } = await renderPanel();

    await userEvent.keyboard(`{${key}}`);

    expect(onChoose.mock.calls).toEqual([[method]]);
  });

  it("opens the other methods with F1", async () => {
    const { onChoose, onChooseOther } = await renderPanel();

    await userEvent.keyboard("{F1}");

    expect(onChooseOther).toHaveBeenCalledOnce();
    expect(onChoose).not.toHaveBeenCalled();
  });

  it.each([
    ["Cobrar en efectivo", "CASH"],
    ["Point débito", "POINT_DEBIT"],
    ["Point crédito", "POINT_CREDIT"],
    ["QR", "QR"],
  ])("starts the method of %s when it is pressed", async (name, method) => {
    const { screen, onChoose } = await renderPanel();

    await screen.getByRole("button", { name }).click();

    expect(onChoose.mock.calls).toEqual([[method]]);
  });

  it("opens the other methods when Otros medios is pressed", async () => {
    const { screen, onChooseOther } = await renderPanel();

    await screen.getByRole("button", { name: "Otros medios" }).click();

    expect(onChooseOther).toHaveBeenCalledOnce();
  });

  it("disables the tiles of the methods that are not enabled, and ignores their keys", async () => {
    const { screen, onChoose } = await renderPanel({
      enabled: new Set<ChargeMethod>(["CASH", "TRANSFER", "STANDALONE_TERMINAL"]),
    });

    await expect.element(screen.getByRole("button", { name: "Point débito" })).toBeDisabled();
    await expect.element(screen.getByRole("button", { name: "Point crédito" })).toBeDisabled();
    await expect.element(screen.getByRole("button", { name: "QR" })).toBeDisabled();
    await expect.element(screen.getByRole("button", { name: "Cobrar en efectivo" })).toBeEnabled();
    await userEvent.keyboard("{F9}{F10}{F11}");
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("shows the notice of the cancelled QR order", async () => {
    const { screen } = await renderPanel({ cancelledNotice: true });

    await expect.element(screen.getByText("Se canceló la orden QR.").first()).toBeVisible();
  });

  it("names the minimum below which the terminal is not offered", async () => {
    const { screen } = await renderPanel({ belowMinimum: 1500 });

    await expect
      .element(screen.getByText("Point: no se ofrece para cobrar menos de $ 15,00").first())
      .toBeVisible();
  });

  it("shows the notice of the paid order it is given", async () => {
    const { screen } = await renderPanel({ paidOrderNotice: <p>Pago de Mercado Pago</p> });

    await expect.element(screen.getByText("Pago de Mercado Pago")).toBeVisible();
  });
});
