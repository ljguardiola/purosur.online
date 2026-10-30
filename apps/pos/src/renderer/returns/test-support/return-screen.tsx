import type {
  CompleteReturnOutcome,
  FindSaleForReturnOutcome,
  PreviewReturnOutcome,
  ReturnDraftLineBody,
  SignInUser,
} from "@purosur/contracts";
import { onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { BarcodeReadings } from "../../shell/barcode-readings";
import { render } from "../../shell/test-support/render-with-router";
import type { ReturnScreenProps } from "../return-screen";
import { ReturnScreen } from "../return-screen";
import { SALE } from "./sale-for-return";

export const QR_TEXT = `https://www.arca.gob.ar/fe/qr/?p=${btoa(JSON.stringify({ ver: 1, ptoVta: 3, tipoCmp: 11, nroCmp: 1192 }))}`;

const CASHIER: ReturnScreenProps["person"] = {
  user_id: "u1",
  first_name: "Tomás",
  abilities: ["view_sales_history"],
};

export function previewOf(lines: readonly ReturnDraftLineBody[]): PreviewReturnOutcome {
  const previewed = lines.map((line) => {
    const sold = SALE.lines.find(({ id }) => id === line.sale_line_id);
    const refusal =
      sold !== undefined && line.quantity > sold.returnable_quantity
        ? ({ kind: "quantity_exceeds_returnable", returnable: sold.returnable_quantity } as const)
        : line.reason === null
          ? ({ kind: "missing_reason" } as const)
          : line.disposition === null
            ? ({ kind: "missing_disposition" } as const)
            : null;
    const refundAmount =
      refusal === null && sold !== undefined
        ? Math.round((sold.charged_amount * line.quantity) / sold.sold_quantity)
        : null;
    return { ...line, sale_line_id: line.sale_line_id, refusal, refund_amount: refundAmount };
  });
  return {
    kind: "previewed",
    lines: previewed.map(
      ({ sale_line_id, quantity, reason, disposition, refusal, refund_amount }) => ({
        sale_line_id,
        quantity,
        reason,
        disposition,
        refusal,
        refund_amount,
      }),
    ),
    refundable_total: previewed.reduce((sum, { refund_amount }) => sum + (refund_amount ?? 0), 0),
  };
}

type Overrides = Partial<
  Pick<
    ReturnScreenProps,
    | "person"
    | "findSaleForReturn"
    | "previewReturn"
    | "completeReturn"
    | "loadAuthorizers"
    | "onSessionInvalid"
  >
>;

export async function renderScreen(overrides: Overrides = {}) {
  await page.viewport(1440, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const findSaleForReturn =
    overrides.findSaleForReturn ??
    vi.fn(async (): Promise<FindSaleForReturnOutcome> => ({ kind: "found", sale: SALE }));
  const previewReturn =
    overrides.previewReturn ??
    vi.fn(async (_saleId: string, lines: readonly ReturnDraftLineBody[]) => previewOf(lines));
  const completeReturn =
    overrides.completeReturn ??
    vi.fn(
      async (): Promise<CompleteReturnOutcome> => ({
        kind: "completed",
        return_id: "return-1",
        refunded_in_cash: 970_000,
        refunds: [
          {
            payment_id: "pay-cash",
            method: "CASH",
            amount: 970_000,
            state: "APPROVED",
            sent_by_cloud: false,
          },
        ],
        authorized_by: null,
      }),
    );
  const authorizers: SignInUser[] = [
    { id: "u2", first_name: "Grace" },
    { id: "u3", first_name: "Lucía" },
  ];
  const onSessionInvalid = overrides.onSessionInvalid ?? vi.fn();
  const readers = new Set<(code: string) => void>();
  const screen = await render(
    <BarcodeReadings
      onBarcodeRead={(listener) => {
        readers.add(listener);
        return () => {
          readers.delete(listener);
        };
      }}
    >
      <ReturnScreen
        person={overrides.person ?? CASHIER}
        registerName="Caja 1"
        lock={() => {}}
        findSaleForReturn={findSaleForReturn}
        previewReturn={previewReturn}
        completeReturn={completeReturn}
        loadAuthorizers={overrides.loadAuthorizers ?? (async () => authorizers)}
        onSessionInvalid={onSessionInvalid}
      />
    </BarcodeReadings>,
  );
  return {
    screen,
    findSaleForReturn,
    previewReturn,
    completeReturn,
    onSessionInvalid,
    readBarcode(code: string) {
      for (const listener of readers) listener(code);
    },
  };
}

export type RenderedScreen = Awaited<ReturnType<typeof renderScreen>>["screen"];

export async function typeTicket(
  screen: RenderedScreen,
  pointOfSale = "00003",
  number = "00001192",
) {
  await userEvent.fill(screen.getByRole("textbox", { name: "Punto de venta" }), pointOfSale);
  await userEvent.fill(screen.getByRole("textbox", { name: "Número de comprobante" }), number);
  await userEvent.click(screen.getByRole("button", { name: "Buscar venta" }));
}

export async function openReturn(screen: RenderedScreen) {
  await typeTicket(screen);
  await userEvent.click(screen.getByRole("button", { name: "Coincide: seguir" }));
}

export async function chooseReturnLine(
  screen: RenderedScreen,
  product: string,
  { reason, disposition }: { reason?: string; disposition?: string } = {},
) {
  await screen.getByRole("checkbox", { name: new RegExp(product) }).click({ force: true });
  if (reason !== undefined) {
    await userEvent.click(screen.getByRole("button", { name: new RegExp(`Motivo de ${product}`) }));
    await userEvent.click(screen.getByRole("option", { name: new RegExp(reason) }));
  }
  if (disposition !== undefined) {
    await userEvent.click(
      screen.getByRole("button", { name: new RegExp(`Destino de ${product}`) }),
    );
    await userEvent.click(screen.getByRole("option", { name: disposition }));
  }
}
