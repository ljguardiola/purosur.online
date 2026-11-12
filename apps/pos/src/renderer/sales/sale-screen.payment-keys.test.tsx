import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import {
  AVAILABLE,
  renderScreen,
  SALE_OF_FOUR_LINES,
  SALE_OF_YERBA,
  scan,
} from "./test-support/sale-screen";

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

function payment(screen: Awaited<ReturnType<typeof renderScreen>>["screen"]) {
  return screen.getByRole("complementary", { name: "Panel de cobro" });
}

describe("SaleScreen when the core answers a method is not offered for the total", () => {
  async function chargeableWith(availability: Partial<typeof AVAILABLE>) {
    const rendered = await renderScreen({
      currentSale: async () => SALE_OF_FOUR_LINES,
      paymentMethodAvailability: async () => ({ ...AVAILABLE, ...availability }),
    });
    await expect.element(rendered.screen.getByText("Pasas de uva")).toBeVisible();
    return rendered;
  }

  it("says Point is not offered below its minimum and leaves the Point tiles and keys inactive, keeping cash and QR", async () => {
    const { screen } = await chargeableWith({ point: "below_minimum" });

    await expect
      .element(payment(screen).getByRole("status"))
      .toHaveTextContent("Point: no se ofrece para cobrar menos de $ 15,00");
    await expect.element(screen.getByRole("button", { name: "Point débito" })).toBeDisabled();
    await expect.element(screen.getByRole("button", { name: "Point crédito" })).toBeDisabled();
    await expect.element(screen.getByRole("button", { name: "QR" })).toBeEnabled();
    await expect.element(screen.getByRole("button", { name: "Cobrar en efectivo" })).toBeEnabled();

    await userEvent.keyboard("{F9}");
    await userEvent.keyboard("{F10}");
    expect(screen.router.state.location.pathname).not.toBe("/charge");

    await userEvent.keyboard("{F11}");
    await expect.poll(() => screen.router.state.location.pathname).toBe("/charge");
    expect(searchOf(screen).method).toBe("QR");
  });

  it("shows the Point minimum the core answers", async () => {
    const { screen } = await chargeableWith({ point: "below_minimum", point_minimum: 2_500 });

    await expect
      .element(payment(screen).getByRole("status"))
      .toHaveTextContent("Point: no se ofrece para cobrar menos de $ 25,00");
  });

  it("leaves the QR tile and F11 inactive below its minimum, keeping Point, with no notice", async () => {
    const { screen } = await chargeableWith({ qr: "below_minimum" });

    await expect.element(screen.getByRole("button", { name: "QR" })).toBeDisabled();
    await expect.element(screen.getByRole("button", { name: "Point débito" })).toBeEnabled();
    await expect.element(payment(screen).getByRole("status")).not.toBeInTheDocument();

    await userEvent.keyboard("{F11}");
    expect(screen.router.state.location.pathname).not.toBe("/charge");

    await userEvent.keyboard("{F9}");
    await expect.poll(() => screen.router.state.location.pathname).toBe("/charge");
    expect(searchOf(screen).method).toBe("POINT_DEBIT");
  });

  it.each(["offline", "not_configured"] as const)(
    "leaves the Point tiles as they are when Point is %s",
    async (point) => {
      const { screen } = await chargeableWith({ point });

      await expect.element(screen.getByRole("button", { name: "Point débito" })).toBeEnabled();
      await expect.element(payment(screen).getByRole("status")).not.toBeInTheDocument();
    },
  );

  it("reads the availability once for the sale shown", async () => {
    const { screen, paymentMethodAvailability } = await renderScreen({
      currentSale: async () => SALE_OF_YERBA,
    });

    await expect.element(screen.getByText("Yerba mate 1 kg").first()).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Point débito" })).toBeEnabled();

    expect(paymentMethodAvailability).toHaveBeenCalledOnce();
  });

  it("reads the availability again when the total of the sale changes", async () => {
    const { screen, field, paymentMethodAvailability } = await renderScreen({
      currentSale: async () => SALE_OF_YERBA,
      scanProduct: async () => ({
        kind: "added",
        removed_manual_discount: false,
        removed_sale_discount: false,
        sale: SALE_OF_FOUR_LINES,
      }),
    });
    await expect.element(screen.getByText("Yerba mate 1 kg").first()).toBeVisible();
    const readsBefore = paymentMethodAvailability.mock.calls.length;

    await scan(field, "7790001");

    await expect.element(screen.getByText("Pasas de uva")).toBeVisible();
    await expect
      .poll(() => paymentMethodAvailability.mock.calls.length)
      .toBeGreaterThan(readsBefore);
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
    expect(
      screen.getByRole("button", { name: "Cobrar con el pago de Mercado Pago" }).element()
        .textContent,
    ).toMatch(/Enter/);
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

    await scan(field, "7790001");

    expect(screen.router.state.location.pathname).not.toBe("/charge");
  });

  it("leaves Enter to the focused button, asking to empty the sale from Vaciar", async () => {
    const { screen } = await renderScreen({ currentSale: async () => WITH_PAID_ORDER });
    await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
    screen.getByRole("button", { name: "Vaciar" }).element().focus();

    await userEvent.keyboard("{Enter}");

    await expect.element(screen.getByRole("dialog")).toBeVisible();
    expect(screen.router.state.location.pathname).not.toBe("/charge");
  });

  it("does not charge with the paid order while the core refuses the charge, saying why", async () => {
    const { screen } = await renderScreen({
      currentSale: async () => ({
        ...WITH_PAID_ORDER,
        charge_refusal: { kind: "no_buyer_identification_threshold" as const },
      }),
    });
    await expect.element(screen.getByText("Falta el tope de venta")).toBeVisible();

    await userEvent.keyboard("{Enter}");

    await expect
      .element(screen.getByRole("button", { name: "Cobrar con el pago de Mercado Pago" }))
      .toBeDisabled();
    expect(screen.router.state.location.pathname).not.toBe("/charge");
  });
});
