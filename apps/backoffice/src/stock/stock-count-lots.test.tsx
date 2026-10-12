import { type StockCountBody, stockCountBodySchema } from "@purosur/contracts";
import type { SaleUnit } from "@purosur/domain";
import { FieldSizeProvider, useRequestForm } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { type CountLot, countBody, lotsMessage } from "./stock-count-form";
import { CountLotsField } from "./stock-count-lots";
import {
  ALMONDS_FIRST_LOT_ID,
  ALMONDS_SECOND_LOT_ID,
  almondsExpectedByLot,
} from "./test-support/stock-fixtures";

const { lots } = almondsExpectedByLot;
const AT = "2026-09-15T21:40:30.000Z";
const FIRST_LOT = /^Cantidad contada del lote L-2312/;
const SECOND_LOT = /^Cantidad contada del lote sin número/;

function Harness({
  countLots,
  saleUnit,
  onSubmit,
}: {
  countLots: readonly CountLot[];
  saleUnit: SaleUnit;
  onSubmit: (request: StockCountBody) => void;
}) {
  const { form, submit } = useRequestForm({
    defaultValues: { lots: {} as Record<string, string> },
    request: {
      schema: stockCountBodySchema,
      from: ({ lots: typed }) =>
        countBody(
          {
            productId: "11111111-1111-4111-8111-111111111111",
            mode: "lots",
            counted: "",
            lots: typed,
          },
          { saleUnit, lots: countLots, at: AT },
        ),
    },
    fields: { productId: null, counted: null, lots: "lots", occurredAt: null },
    messages: { lots: ({ lots: typed }) => lotsMessage(typed, countLots, saleUnit) },
    onSubmit: async (request) => onSubmit(request),
  });
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <form.AppField name="lots">
          {() => <CountLotsField lots={countLots} saleUnit={saleUnit} />}
        </form.AppField>
        <button type="button" onClick={() => void submit()}>
          Enviar
        </button>
      </main>
    </FieldSizeProvider>
  );
}

function renderLots(onSubmit: (request: StockCountBody) => void = () => {}) {
  return render(<Harness countLots={lots} saleUnit="KG" onSubmit={onSubmit} />);
}

test("lists each lot in the order given with its number, expiry and expected balance", async () => {
  const screen = await renderLots();

  await expect.element(screen.getByText("Cantidad contada de cada lote")).toBeVisible();
  const first = screen.getByText("L-2312").element();
  const second = screen.getByText("—", { exact: true }).element();
  expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  await expect.element(screen.getByText("Vence el 14/10/2026 · saldo 4,400 kg")).toBeVisible();
  await expect.element(screen.getByText("Sin vencimiento · saldo 8,000 kg")).toBeVisible();
  await expect.element(screen.getByText("Un lote sin cantidad queda en cero.")).toBeVisible();
  await expect.element(screen.getByRole("textbox", { name: FIRST_LOT })).toBeVisible();
  await expect.element(screen.getByRole("textbox", { name: SECOND_LOT })).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the quantity typed for each lot apart", async () => {
  const onSubmit = vi.fn();
  const screen = await renderLots(onSubmit);

  await userEvent.fill(screen.getByRole("textbox", { name: FIRST_LOT }), "4,300");
  await userEvent.fill(screen.getByRole("textbox", { name: SECOND_LOT }), "7,850");
  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.poll(() => onSubmit.mock.calls.length).toBe(1);
  expect(onSubmit.mock.calls[0]?.[0].lots).toEqual([
    { lotId: ALMONDS_FIRST_LOT_ID, counted: 4_300 },
    { lotId: ALMONDS_SECOND_LOT_ID, counted: 7_850 },
  ]);
});

test("shows the lots' message once below them and marks every lot's field with it", async () => {
  const screen = await renderLots();
  await userEvent.fill(screen.getByRole("textbox", { name: FIRST_LOT }), "mucho");

  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  const message = "Escribí los kilos con coma para los decimales, hasta 3, por ejemplo 12,150.";
  await expect.element(screen.getByText(message)).toBeVisible();
  await expect.element(screen.getByRole("textbox", { name: FIRST_LOT })).toBeInvalid();
  await expect
    .element(screen.getByRole("textbox", { name: FIRST_LOT }))
    .toHaveAccessibleDescription(/Escribí los kilos con coma/);
  await expect.element(screen.getByRole("textbox", { name: SECOND_LOT })).toBeInvalid();
  await expect
    .element(screen.getByRole("textbox", { name: SECOND_LOT }))
    .toHaveAccessibleDescription(/Escribí los kilos con coma/);
});
