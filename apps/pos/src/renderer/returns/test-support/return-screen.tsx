import type {
  CompleteReturnOutcome,
  FindSaleForReturnOutcome,
  PreviewReturnOutcome,
  ReturnDraftLineBody,
  SignInUser,
} from "@purosur/contracts";
import { expect, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { SaleForReturnReading } from "../../platform/core-client";
import { BarcodeReadings } from "../../shell/barcode-readings";
import { render } from "../../shell/test-support/render-with-router";
import type { ReturnScreenProps } from "../return-screen";
import { ReturnScreen } from "../return-screen";
import { CASH, SALE } from "./sale-for-return";

export const CASH_SALE = {
  ...SALE,
  payments: [{ ...CASH, amount: SALE.total, remaining: SALE.total }],
};

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
            : line.reason === "defective" && line.resolution === null
              ? ({ kind: "missing_resolution" } as const)
              : null;
    const resolution = line.resolution ?? (line.reason === "defective" ? null : "refund");
    const refundAmount =
      refusal === null && sold !== undefined
        ? resolution === "exchange"
          ? 0
          : Math.round((sold.charged_amount * line.quantity) / sold.sold_quantity)
        : null;
    return { ...line, resolution, refusal, refund_amount: refundAmount };
  });
  return {
    kind: "previewed",
    lines: previewed.map(
      ({ sale_line_id, quantity, reason, disposition, resolution, refusal, refund_amount }) => ({
        sale_line_id,
        quantity,
        reason,
        disposition,
        resolution,
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
    | "saleId"
  >
>;

export async function renderScreen(overrides: Overrides = {}) {
  await page.viewport(1440, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const findSaleForReturn =
    overrides.findSaleForReturn ??
    vi.fn(
      async (reading: SaleForReturnReading): Promise<FindSaleForReturnOutcome> => ({
        kind: "found",
        sale: CASH_SALE,
        ticket_source:
          reading.kind === "scanned" ? "QR" : reading.kind === "sale" ? "HISTORY" : "TYPED",
        ticket_verification_required: reading.kind !== "sale",
      }),
    );
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
        {...(overrides.saleId === undefined ? {} : { saleId: overrides.saleId })}
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

export function searchBox(screen: RenderedScreen) {
  return screen.getByRole("searchbox", { name: "Escaneá el ticket o escribí el número" });
}

export function legendOf(screen: RenderedScreen): string[] {
  return screen
    .getByRole("listitem")
    .elements()
    .filter((item) => item.querySelector("kbd") !== null && item.closest("table") === null)
    .map((item) => item.textContent.trim());
}

export function linesTable(screen: RenderedScreen) {
  return screen.getByRole("table", { name: "Líneas de la venta" });
}

export async function lookUp(screen: RenderedScreen, text = "00003-00001192") {
  await userEvent.fill(searchBox(screen), text);
  await userEvent.keyboard("{Enter}");
}

export async function openReturn(screen: RenderedScreen) {
  await lookUp(screen);
  await expect.element(linesTable(screen).getByText("Pasta de maní 380 g").last()).toBeVisible();
}

export async function selectLine(screen: RenderedScreen, product: string) {
  await userEvent.click(linesTable(screen).getByText(product, { exact: true }));
}

export async function markLine(screen: RenderedScreen, product: string) {
  await selectLine(screen, product);
  await userEvent.keyboard(" ");
}

export async function chooseReturnLine(
  screen: RenderedScreen,
  product: string,
  {
    reason,
    disposition,
    resolution,
    quantity,
  }: { reason?: string; disposition?: string; resolution?: string; quantity?: string } = {},
) {
  await markLine(screen, product);
  if (
    reason === undefined &&
    disposition === undefined &&
    resolution === undefined &&
    quantity === undefined
  ) {
    return;
  }
  await userEvent.keyboard("{F6}");
  if (quantity !== undefined) {
    await userEvent.fill(screen.getByRole("textbox", { name: "Cantidad" }), quantity);
  }
  for (const option of [reason, resolution, disposition]) {
    if (option !== undefined) {
      await screen.getByRole("radio", { name: option }).click({ force: true });
    }
  }
  await userEvent.keyboard("{Enter}");
}
