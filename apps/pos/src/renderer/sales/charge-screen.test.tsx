import type {
  CashChargeAnswer,
  ChargeSaleByTransferOutcome,
  ChargeSaleInCashOutcome,
  CurrentSaleAnswer,
  OpenSale,
} from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { ChargeScreenProps } from "./charge-screen";
import { ChargeScreen } from "./charge-screen";

const PERSON: ChargeScreenProps["person"] = {
  user_id: "u1",
  first_name: "Ada",
  abilities: ["open_cash_session"],
};
const YERBA = {
  id: "line-1",
  product_id: "p1",
  product_name: "Yerba mate 1 kg",
  quantity: 2,
  list_unit_price: 238_000,
  discount_amount: 0,
  promotion: null,
  line_total: 476_000,
};
const ALFAJOR = {
  id: "line-2",
  product_id: "p2",
  product_name: "Alfajor triple",
  quantity: 1,
  list_unit_price: 150_000,
  discount_amount: 0,
  promotion: null,
  line_total: 150_000,
};
const SALE_OF_ONE_LINE: OpenSale = {
  id: "sale-1",
  lines: [YERBA],
  total: 476_000,
  paid: 0,
  pending: 476_000,
  lines_editable: true,
  cancellable: true,
  charge_refusal: null,
  refunds_on_cancel: [],
  cancel_authorization_required: false,
};
const SALE_OF_TWO_LINES: OpenSale = {
  id: "sale-1",
  lines: [YERBA, ALFAJOR],
  total: 626_000,
  paid: 0,
  pending: 626_000,
  lines_editable: true,
  cancellable: true,
  charge_refusal: null,
  refunds_on_cancel: [],
  cancel_authorization_required: false,
};
const COMPLETED: ChargeSaleInCashOutcome = {
  kind: "completed",
  sale_id: "sale-1",
  total: 476_000,
  tendered: 500_000,
  change: 24_000,
};

const TRANSFER_COMPLETED: ChargeSaleByTransferOutcome = {
  kind: "completed",
  sale_id: "sale-1",
  total: 476_000,
};

const SALE_WITH_PART_PAID: OpenSale = {
  ...SALE_OF_ONE_LINE,
  paid: 100_000,
  pending: 376_000,
  lines_editable: false,
  cancellable: false,
};

const COVERED: CashChargeAnswer = { kind: "covered", applied: 476_000, change: 24_000 };

type Overrides = {
  currentSale?: () => Promise<CurrentSaleAnswer>;
  cashCharge?: (saleId: string, tendered: number) => Promise<CashChargeAnswer>;
  chargeSaleInCash?: (saleId: string, tendered: number) => Promise<ChargeSaleInCashOutcome>;
  chargeSaleByTransfer?: (saleId: string, amount: number) => Promise<ChargeSaleByTransferOutcome>;
};

async function renderScreen(overrides: Overrides = {}) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const currentSale = vi.fn(overrides.currentSale ?? (async () => SALE_OF_ONE_LINE));
  const cashCharge = vi.fn(overrides.cashCharge ?? (async () => COVERED));
  const chargeSaleInCash = vi.fn(overrides.chargeSaleInCash ?? (async () => COMPLETED));
  const chargeSaleByTransfer = vi.fn(
    overrides.chargeSaleByTransfer ?? (async () => TRANSFER_COMPLETED),
  );
  const onSessionInvalid = vi.fn();
  const screen = await render(
    <ChargeScreen
      sessionId="s1"
      person={PERSON}
      registerName="Caja 1"
      lock={() => {}}
      currentSale={currentSale}
      cashCharge={cashCharge}
      chargeSaleInCash={chargeSaleInCash}
      chargeSaleByTransfer={chargeSaleByTransfer}
      onSessionInvalid={onSessionInvalid}
    />,
  );
  return {
    screen,
    currentSale,
    cashCharge,
    chargeSaleInCash,
    chargeSaleByTransfer,
    onSessionInvalid,
  };
}

type Screen = Awaited<ReturnType<typeof renderScreen>>["screen"];

async function chooseCash(screen: Screen) {
  await userEvent.click(screen.getByText("Efectivo", { exact: true }));
}

async function chooseTransfer(screen: Screen) {
  await userEvent.click(screen.getByText("Transferencia", { exact: true }));
}

async function chargeInCash(screen: Screen, tendered: string) {
  await chooseCash(screen);
  await userEvent.fill(
    screen.getByRole("textbox", { name: "Importe entregado por el cliente" }),
    tendered,
  );
  await userEvent.click(screen.getByRole("button", { name: "Completar venta" }));
}

describe("ChargeScreen", () => {
  it("offers transfer as a way to pay, next to cash", async () => {
    const { screen } = await renderScreen();

    await expect.element(screen.getByRole("radio", { name: "Transferencia" })).toBeVisible();
    await expect
      .element(screen.getByText("Confirmás al ver el ingreso en la cuenta del negocio"))
      .toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("offers cash as the way to pay, for the sale in progress", async () => {
    const { screen } = await renderScreen({ currentSale: async () => SALE_OF_TWO_LINES });

    await expect.element(screen.getByText("COBRO · VENTA DE 2 LÍNEAS")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "Elegí el medio de pago" }))
      .toBeVisible();
    await expect.element(screen.getByRole("radio", { name: "Efectivo" })).toBeVisible();
    await expect.element(screen.getByText("Cargás lo entregado y ves el vuelto")).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("says one line in the singular", async () => {
    const { screen } = await renderScreen();

    await expect.element(screen.getByText("COBRO · VENTA DE 1 LÍNEA")).toBeVisible();
  });

  it("shows the total still to be charged in the payment panel", async () => {
    const { screen } = await renderScreen({ currentSale: async () => SALE_OF_TWO_LINES });

    const panel = screen.getByRole("complementary", { name: "Panel de cobro" });
    await expect.element(panel.getByText("$ 6.260,00").first()).toBeVisible();
    await expect.element(panel.getByText("$ 0,00")).toBeVisible();
  });

  it("shows the paid amount and the pending balance the core answers for the sale", async () => {
    const { screen } = await renderScreen({ currentSale: async () => SALE_WITH_PART_PAID });

    const panel = screen.getByRole("complementary", { name: "Panel de cobro" });
    await expect.element(panel.getByText("$ 4.760,00")).toBeVisible();
    await expect.element(panel.getByText("$ 1.000,00")).toBeVisible();
    await expect.element(panel.getByText("$ 3.760,00")).toBeVisible();
  });

  it("marks Venta as the current screen of the menu", async () => {
    const { screen } = await renderScreen();

    await expect
      .element(screen.getByRole("navigation", { name: "Menú de la caja" }).getByText("Venta"))
      .toBeVisible();
    await expect.element(screen.getByText("Ada")).not.toBeInTheDocument();
  });

  it("goes back to the sale from Volver a la venta", async () => {
    const { screen } = await renderScreen();

    await userEvent.click(screen.getByRole("button", { name: "Volver a la venta" }));

    await expect.poll(() => screen.router.state.location.pathname).toBe("/session");
  });

  it.each<[string, CurrentSaleAnswer]>([
    ["there is no sale", null],
    [
      "the sale has no lines",
      {
        id: "sale-1",
        lines: [],
        total: 0,
        paid: 0,
        pending: 0,
        lines_editable: true,
        cancellable: true,
        charge_refusal: null,
        refunds_on_cancel: [],
        cancel_authorization_required: false,
      },
    ],
    ["the person may not sell", "not_permitted"],
  ])("goes back to the sale when %s", async (_, answer) => {
    const { screen } = await renderScreen({ currentSale: async () => answer });

    await expect.poll(() => screen.router.state.location.pathname).toBe("/session");
  });

  it("says the sale could not be loaded and reads it again on retry", async () => {
    const answers = [
      () => Promise.reject(new Error("the core could not read the sale in progress")),
      () => Promise.resolve(SALE_OF_ONE_LINE),
    ];
    const { screen, currentSale } = await renderScreen({
      currentSale: () => {
        const answer = answers.shift();
        if (answer === undefined) {
          throw new Error("no answer left");
        }
        return answer();
      },
    });

    await expect.element(screen.getByText("No se pudo cargar la venta")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await expect.element(screen.getByRole("radio", { name: "Efectivo" })).toBeVisible();
    expect(currentSale).toHaveBeenCalledTimes(2);
  });

  it("opens the cash charge when Efectivo is chosen, and returns to the methods from Cambiar de medio", async () => {
    const { screen } = await renderScreen();

    await chooseCash(screen);
    await expect.element(screen.getByText("COBRO EN EFECTIVO")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));

    await expect.element(screen.getByText("COBRO EN EFECTIVO")).not.toBeInTheDocument();
    await expect.element(screen.getByRole("radio", { name: "Efectivo" })).toBeVisible();
  });

  it("charges the sale in cash and shows it as completed with the change", async () => {
    const { screen, chargeSaleInCash } = await renderScreen();

    await chargeInCash(screen, "5.000,00");

    await expect.element(screen.getByText("VENTA COMPLETADA")).toBeVisible();
    await expect.element(screen.getByRole("heading", { name: "Entregá el vuelto" })).toBeVisible();
    expect(chargeSaleInCash).toHaveBeenCalledExactlyOnceWith("sale-1", 500_000);
  });

  it("shows the sale as paid behind the completed sale, with no way back to it", async () => {
    const { screen } = await renderScreen();

    await chargeInCash(screen, "5.000,00");

    const panel = screen.getByRole("complementary", {
      name: "Panel de cobro",
      includeHidden: true,
    });
    await expect.element(panel.getByText("Saldo pendiente")).toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: "Volver a la venta", includeHidden: true }))
      .not.toBeInTheDocument();
  });

  it.each([
    { kind: "reaches_buyer_identification_threshold", threshold: 476_000 },
    { kind: "no_buyer_identification_threshold" },
  ] as const)("offers no way to pay a sale the core refuses to charge: %j", async (refusal) => {
    const { screen } = await renderScreen({
      currentSale: async () => ({ ...SALE_OF_ONE_LINE, charge_refusal: refusal }),
    });

    await expect.poll(() => screen.router.state.location.pathname).toBe("/session");
    await expect.element(screen.getByText("Elegí el medio de pago")).not.toBeInTheDocument();
  });

  it("goes back to the methods, with the balance the core now answers, after a partial cash payment", async () => {
    const reads = [SALE_OF_ONE_LINE, { ...SALE_OF_ONE_LINE, paid: 400_000, pending: 76_000 }];
    const { screen, chargeSaleInCash } = await renderScreen({
      currentSale: async () => reads.shift() ?? SALE_WITH_PART_PAID,
      cashCharge: async () => ({ kind: "partial", applied: 400_000, pending: 76_000 }),
      chargeSaleInCash: async () => ({
        kind: "partially_paid",
        sale_id: "sale-1",
        total: 476_000,
        paid: 400_000,
        pending: 76_000,
      }),
    });

    await chooseCash(screen);
    await userEvent.fill(
      screen.getByRole("textbox", { name: "Importe entregado por el cliente" }),
      "4.000,00",
    );
    await userEvent.click(screen.getByRole("button", { name: "Registrar pago parcial" }));

    await expect.element(screen.getByText("COBRO EN EFECTIVO")).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("heading", { name: "Elegí el medio de pago" }))
      .toBeVisible();
    const panel = screen.getByRole("complementary", { name: "Panel de cobro" });
    await expect.element(panel.getByText("$ 4.000,00")).toBeVisible();
    await expect.element(panel.getByText("$ 760,00")).toBeVisible();
    await expect.element(screen.getByText("VENTA COMPLETADA")).not.toBeInTheDocument();
    expect(chargeSaleInCash).toHaveBeenCalledExactlyOnceWith("sale-1", 400_000);
  });

  it("keeps the cash charge busy, so it cannot charge again, until the core answers the new balance", async () => {
    const reads = [SALE_OF_ONE_LINE];
    const { screen, chargeSaleInCash } = await renderScreen({
      currentSale: () => {
        const read = reads.shift();
        return read === undefined
          ? new Promise<CurrentSaleAnswer>(() => {})
          : Promise.resolve(read);
      },
      cashCharge: async () => ({ kind: "partial", applied: 400_000, pending: 76_000 }),
      chargeSaleInCash: async () => ({
        kind: "partially_paid",
        sale_id: "sale-1",
        total: 476_000,
        paid: 400_000,
        pending: 76_000,
      }),
    });

    await chooseCash(screen);
    await userEvent.fill(
      screen.getByRole("textbox", { name: "Importe entregado por el cliente" }),
      "4.000,00",
    );
    await userEvent.click(screen.getByRole("button", { name: "Registrar pago parcial" }));

    await expect
      .element(screen.getByRole("button", { name: "Registrar pago parcial" }))
      .toBeDisabled();
    expect(chargeSaleInCash).toHaveBeenCalledOnce();
  });

  it("keeps the transfer busy, so it cannot charge again, until the core answers the new balance", async () => {
    const reads = [SALE_OF_ONE_LINE];
    const { screen, chargeSaleByTransfer } = await renderScreen({
      currentSale: () => {
        const read = reads.shift();
        return read === undefined
          ? new Promise<CurrentSaleAnswer>(() => {})
          : Promise.resolve(read);
      },
      chargeSaleByTransfer: async () => ({
        kind: "partially_paid",
        sale_id: "sale-1",
        total: 476_000,
        paid: 200_000,
        pending: 276_000,
      }),
    });

    await chooseTransfer(screen);
    await userEvent.fill(
      screen.getByRole("textbox", { name: "Importe a cobrar con este medio" }),
      "2.000,00",
    );
    await userEvent.click(screen.getByRole("button", { name: "Vi el ingreso" }));

    await expect.poll(() => chargeSaleByTransfer.mock.calls.length).toBe(1);
    await expect.element(screen.getByRole("button", { name: "Vi el ingreso" })).toBeDisabled();
  });

  it("says the sale could not be loaded when it cannot be read again after a partial cash payment", async () => {
    const reads = [SALE_OF_ONE_LINE];
    const { screen } = await renderScreen({
      currentSale: async () => {
        const read = reads.shift();
        if (read === undefined) {
          throw new Error("the core could not read the sale in progress");
        }
        return read;
      },
      cashCharge: async () => ({ kind: "partial", applied: 400_000, pending: 76_000 }),
      chargeSaleInCash: async () => ({
        kind: "partially_paid",
        sale_id: "sale-1",
        total: 476_000,
        paid: 400_000,
        pending: 76_000,
      }),
    });

    await chooseCash(screen);
    await userEvent.fill(
      screen.getByRole("textbox", { name: "Importe entregado por el cliente" }),
      "4.000,00",
    );
    await userEvent.click(screen.getByRole("button", { name: "Registrar pago parcial" }));

    await expect.element(screen.getByText("No se pudo cargar la venta")).toBeVisible();
    await expect.element(screen.getByText("Elegí el medio de pago")).not.toBeInTheDocument();
  });

  it("says the sale could not be loaded when it cannot be read again after a partial transfer", async () => {
    const reads = [SALE_OF_ONE_LINE];
    const { screen } = await renderScreen({
      currentSale: async () => {
        const read = reads.shift();
        if (read === undefined) {
          throw new Error("the core could not read the sale in progress");
        }
        return read;
      },
      chargeSaleByTransfer: async () => ({
        kind: "partially_paid",
        sale_id: "sale-1",
        total: 476_000,
        paid: 200_000,
        pending: 276_000,
      }),
    });

    await chooseTransfer(screen);
    await userEvent.fill(
      screen.getByRole("textbox", { name: "Importe a cobrar con este medio" }),
      "2.000,00",
    );
    await userEvent.click(screen.getByRole("button", { name: "Vi el ingreso" }));

    await expect.element(screen.getByText("No se pudo cargar la venta")).toBeVisible();
    await expect.element(screen.getByText("Elegí el medio de pago")).not.toBeInTheDocument();
  });

  it("charges the pending balance by transfer unless the cashier lowers the amount", async () => {
    const { screen, chargeSaleByTransfer } = await renderScreen({
      currentSale: async () => SALE_WITH_PART_PAID,
    });

    await chooseTransfer(screen);
    await userEvent.click(screen.getByRole("button", { name: "Vi el ingreso" }));

    expect(chargeSaleByTransfer).toHaveBeenCalledExactlyOnceWith("sale-1", 376_000);
  });

  it("goes back to the methods, with the balance the core now answers, after a partial transfer", async () => {
    const reads = [SALE_OF_ONE_LINE, { ...SALE_OF_ONE_LINE, paid: 200_000, pending: 276_000 }];
    const { screen, chargeSaleByTransfer } = await renderScreen({
      currentSale: async () => reads.shift() ?? SALE_WITH_PART_PAID,
      chargeSaleByTransfer: async () => ({
        kind: "partially_paid",
        sale_id: "sale-1",
        total: 476_000,
        paid: 200_000,
        pending: 276_000,
      }),
    });

    await chooseTransfer(screen);
    await userEvent.fill(
      screen.getByRole("textbox", { name: "Importe a cobrar con este medio" }),
      "2.000,00",
    );
    await userEvent.click(screen.getByRole("button", { name: "Vi el ingreso" }));

    await expect
      .element(screen.getByRole("heading", { name: "Esperando el ingreso en la cuenta" }))
      .not.toBeInTheDocument();
    const panel = screen.getByRole("complementary", { name: "Panel de cobro" });
    await expect.element(panel.getByText("$ 2.000,00")).toBeVisible();
    await expect.element(panel.getByText("$ 2.760,00")).toBeVisible();
    expect(chargeSaleByTransfer).toHaveBeenCalledExactlyOnceWith("sale-1", 200_000);
  });

  it("starts a new sale from Nueva venta by going back to the sale screen", async () => {
    const { screen } = await renderScreen();

    await chargeInCash(screen, "5.000,00");
    await userEvent.click(screen.getByRole("button", { name: "Nueva venta" }));

    await expect.poll(() => screen.router.state.location.pathname).toBe("/session");
  });

  it.each([["empty_sale"], ["zero_total"], ["no_open_sale"], ["not_permitted"]] as const)(
    "goes back to the sale when the core answers %s",
    async (kind) => {
      const { screen } = await renderScreen({ chargeSaleInCash: async () => ({ kind }) });

      await chargeInCash(screen, "5.000,00");

      await expect.poll(() => screen.router.state.location.pathname).toBe("/session");
    },
  );

  it.each([
    { kind: "reaches_buyer_identification_threshold", threshold: 476_000 },
    { kind: "no_buyer_identification_threshold" },
  ] as const)("goes back to the sale when the core answers %j", async (outcome) => {
    const { screen } = await renderScreen({ chargeSaleInCash: async () => outcome });

    await chargeInCash(screen, "5.000,00");

    await expect.poll(() => screen.router.state.location.pathname).toBe("/session");
  });

  it.each([["not_signed_in"], ["no_open_session"]] as const)(
    "reports an invalid session when the core answers %s",
    async (kind) => {
      const { screen, onSessionInvalid } = await renderScreen({
        chargeSaleInCash: async () => ({ kind }),
      });

      await chargeInCash(screen, "5.000,00");

      await expect.poll(() => onSessionInvalid.mock.calls.length).toBe(1);
    },
  );

  it("waits for the transfer without charging when Transferencia is chosen, and returns to the methods from No llegó", async () => {
    const { screen, chargeSaleByTransfer } = await renderScreen();

    await chooseTransfer(screen);
    await expect
      .element(screen.getByRole("heading", { name: "Esperando el ingreso en la cuenta" }))
      .toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "No llegó: cambiar de medio" }));

    await expect
      .element(screen.getByRole("heading", { name: "Esperando el ingreso en la cuenta" }))
      .not.toBeInTheDocument();
    await expect.element(screen.getByRole("radio", { name: "Transferencia" })).toBeVisible();
    expect(chargeSaleByTransfer).not.toHaveBeenCalled();
  });

  it("charges the sale by transfer from Vi el ingreso and shows it as completed with no change", async () => {
    const { screen, chargeSaleByTransfer } = await renderScreen();

    await chooseTransfer(screen);
    await userEvent.click(screen.getByRole("button", { name: "Vi el ingreso" }));

    await expect.element(screen.getByText("VENTA COMPLETADA")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "No hay vuelto para entregar" }))
      .toBeVisible();
    expect(chargeSaleByTransfer).toHaveBeenCalledExactlyOnceWith("sale-1", 476_000);
  });

  it("starts a new sale after a transfer by going back to the sale screen", async () => {
    const { screen } = await renderScreen();

    await chooseTransfer(screen);
    await userEvent.click(screen.getByRole("button", { name: "Vi el ingreso" }));
    await userEvent.click(screen.getByRole("button", { name: "Nueva venta" }));

    await expect.poll(() => screen.router.state.location.pathname).toBe("/session");
  });

  it.each([["empty_sale"], ["zero_total"], ["no_open_sale"], ["not_permitted"]] as const)(
    "goes back to the sale when the core answers %s to a transfer",
    async (kind) => {
      const { screen } = await renderScreen({ chargeSaleByTransfer: async () => ({ kind }) });

      await chooseTransfer(screen);
      await userEvent.click(screen.getByRole("button", { name: "Vi el ingreso" }));

      await expect.poll(() => screen.router.state.location.pathname).toBe("/session");
    },
  );

  it.each([["not_signed_in"], ["no_open_session"]] as const)(
    "reports an invalid session when the core answers %s to a transfer",
    async (kind) => {
      const { screen, onSessionInvalid } = await renderScreen({
        chargeSaleByTransfer: async () => ({ kind }),
      });

      await chooseTransfer(screen);
      await userEvent.click(screen.getByRole("button", { name: "Vi el ingreso" }));

      await expect.poll(() => onSessionInvalid.mock.calls.length).toBe(1);
    },
  );
});
