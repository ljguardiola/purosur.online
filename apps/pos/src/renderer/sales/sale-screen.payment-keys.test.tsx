import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { renderScreen, SALE_OF_FOUR_LINES, SALE_OF_YERBA } from "./test-support/sale-screen";

async function chargeable() {
  const rendered = await renderScreen({ currentSale: async () => SALE_OF_FOUR_LINES });
  await expect.element(rendered.screen.getByText("Pasas de uva")).toBeVisible();
  return rendered;
}

function searchOf(screen: Awaited<ReturnType<typeof renderScreen>>["screen"]) {
  return screen.router.state.location.search as { method?: string };
}

describe("SaleScreen charging by keys", () => {
  it.each([
    ["F12", "CASH"],
    ["F9", "POINT_DEBIT"],
    ["F10", "POINT_CREDIT"],
    ["F11", "QR"],
  ])("opens the charge screen on %s with the method %s", async (key, method) => {
    const { screen } = await chargeable();

    await userEvent.keyboard(`{${key}}`);

    await expect.poll(() => screen.router.state.location.pathname).toBe("/charge");
    expect(searchOf(screen).method).toBe(method);
  });

  it("opens the charge screen on F1 with no method chosen", async () => {
    const { screen } = await chargeable();

    await userEvent.keyboard("{F1}");

    await expect.poll(() => screen.router.state.location.pathname).toBe("/charge");
    expect(searchOf(screen).method).toBeUndefined();
  });

  it.each([
    ["Cobrar en efectivo", "CASH"],
    ["Point débito", "POINT_DEBIT"],
    ["Point crédito", "POINT_CREDIT"],
    ["QR", "QR"],
  ])("opens the charge screen with %s when its button is pressed", async (name, method) => {
    const { screen } = await chargeable();

    await screen.getByRole("button", { name }).click();

    await expect.poll(() => screen.router.state.location.pathname).toBe("/charge");
    expect(searchOf(screen).method).toBe(method);
  });

  it("opens the charge screen with no method from Otros medios", async () => {
    const { screen } = await chargeable();

    await screen.getByRole("button", { name: "Otros medios" }).click();

    await expect.poll(() => screen.router.state.location.pathname).toBe("/charge");
    expect(searchOf(screen).method).toBeUndefined();
  });

  it("shows the total and the number of articles", async () => {
    const { screen } = await chargeable();

    const panel = screen.getByRole("complementary", { name: "Panel de cobro" });
    await expect.element(panel.getByText("$ 25.192,50").first()).toBeVisible();
    await expect.element(panel.getByText("Artículos")).toBeVisible();
    await expect.element(panel.getByText("4", { exact: true })).toBeVisible();
  });
});

describe("SaleScreen with a paid order not yet applied", () => {
  const WITH_PAID_ORDER = {
    ...SALE_OF_YERBA,
    rebuilt_paid_order: {
      payment_transaction_id: "order-1",
      method: "QR" as const,
      amount: 920_000,
      applied: false,
    },
  };

  it("shows the paid order and its single button, with no other way to charge", async () => {
    const { screen } = await renderScreen({ currentSale: async () => WITH_PAID_ORDER });

    await expect.element(screen.getByText("Pago con Mercado Pago de $ 9.200,00")).toBeVisible();
    await expect
      .element(screen.getByText("Aplicado a la venta antes de cobrar con otro medio."))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Cobrar con el pago de Mercado Pago" }))
      .toHaveTextContent("Enter");
    for (const name of [
      "Cobrar en efectivo",
      "Point débito",
      "Point crédito",
      "QR",
      "Otros medios",
    ]) {
      await expect
        .element(screen.getByRole("button", { name, exact: true }))
        .not.toBeInTheDocument();
    }
  });

  it("opens the charge screen with the paid order's method on Enter", async () => {
    const { screen } = await renderScreen({ currentSale: async () => WITH_PAID_ORDER });
    await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();

    await userEvent.keyboard("{Enter}");

    await expect.poll(() => screen.router.state.location.pathname).toBe("/charge");
    expect(searchOf(screen).method).toBe("QR");
  });

  it("opens the charge screen with no method for a Point paid order, whose card is not known", async () => {
    const { screen } = await renderScreen({
      currentSale: async () => ({
        ...WITH_PAID_ORDER,
        rebuilt_paid_order: { ...WITH_PAID_ORDER.rebuilt_paid_order, method: "POINT" },
      }),
    });
    await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();

    await userEvent.keyboard("{Enter}");

    await expect.poll(() => screen.router.state.location.pathname).toBe("/charge");
    expect(searchOf(screen).method).toBeUndefined();
  });

  it("leaves Enter to the search field while it holds a code", async () => {
    const { screen, field } = await renderScreen({ currentSale: async () => WITH_PAID_ORDER });
    await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();

    await field.fill("7790001");
    await userEvent.keyboard("{Enter}");

    expect(screen.router.state.location.pathname).not.toBe("/charge");
  });
});
