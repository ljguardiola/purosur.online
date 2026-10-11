import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { StockLotsModal, type StockLotsModalServices } from "./stock-lots-modal";
import {
  almonds,
  expiringLot,
  honey,
  lotWithoutNumber,
  negativeLot,
  technicalLot,
} from "./test-support/stock-fixtures";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

function createServices(): StockLotsModalServices {
  return { fetchProductLots: vi.fn() };
}

function renderModal(
  services: StockLotsModalServices,
  {
    product = almonds,
    onClose = () => {},
    onSessionEnded = () => {},
  }: { product?: typeof almonds; onClose?: () => void; onSessionEnded?: () => void } = {},
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <StockLotsModal
        product={product}
        services={services}
        onClose={onClose}
        onSessionEnded={onSessionEnded}
      />
    </FieldSizeProvider>,
  );
}

function withLots(...lots: Parameters<typeof lotsOf>) {
  const services = createServices();
  vi.mocked(services.fetchProductLots).mockResolvedValue(lotsOf(...lots));
  return services;
}

function lotsOf(...lots: (typeof expiringLot)[]) {
  return { kind: "ok", value: { lots } } as const;
}

test("titles the modal with the product and requests that product's lots", async () => {
  const services = withLots(expiringLot);

  const screen = await renderModal(services, { product: honey });

  await expect.element(screen.getByRole("heading", { name: honey.name })).toBeVisible();
  expect(services.fetchProductLots).toHaveBeenCalledWith(honey.id);
});

test("lists each lot with its number, expiry, purchase date, quantity and value at cost", async () => {
  const screen = await renderModal(withLots(expiringLot, lotWithoutNumber));

  const table = screen.getByRole("table", { name: "Lotes" });
  await expect.element(table.getByText("L-2041")).toBeVisible();
  await expect.element(table.getByText("5 de diciembre")).toBeVisible();
  await expect.element(table.getByText("10 de septiembre")).toBeVisible();
  await expect.element(table.getByText("8,000 kg")).toBeVisible();
  await expect.element(table.getByText("$ 12.500,00")).toBeVisible();
  await expect.element(table.getByText("Sin número")).toBeVisible();
  await expect.element(table.getByText("Sin vencimiento")).toBeVisible();
  await expect.element(table.getByText("4,150 kg")).toBeVisible();
  await expect.element(table.getByText("$ 6.400,00")).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("shows a negative lot with its negative quantity and value", async () => {
  const screen = await renderModal(withLots(negativeLot));

  const table = screen.getByRole("table", { name: "Lotes" });
  await expect.element(table.getByText("− 2,000 kg")).toBeVisible();
  await expect.element(table.getByText("$ -3.100,00")).toBeVisible();
});

test("shows a technical lot with its quantity and an incomplete cost", async () => {
  const screen = await renderModal(withLots(technicalLot));

  const table = screen.getByRole("table", { name: "Lotes" });
  await expect.element(table.getByText("Lote técnico")).toBeVisible();
  await expect.element(table.getByText("1,000 kg")).toBeVisible();
  await expect.element(table.getByText("Costo incompleto")).toBeVisible();
  expect(table.getByText("Sin número").query()).toBeNull();
});

test("keeps the lots in the order the cloud answers them", async () => {
  const screen = await renderModal(withLots(negativeLot, expiringLot, lotWithoutNumber));

  await expect.element(screen.getByText("L-2041")).toBeVisible();
  const numbers = screen
    .getByRole("row")
    .elements()
    .map((row) => row.textContent ?? "");
  const positions = ["L-1900", "L-2041", "Sin número"].map((text) =>
    numbers.findIndex((row) => row.includes(text)),
  );
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
});

test("says the product has no lots with a balance when the cloud lists none", async () => {
  const screen = await renderModal(withLots());

  await expect.element(screen.getByText("Este producto no tiene lotes con saldo")).toBeVisible();
});

test("shows the table as loading while the lots are read", async () => {
  const services = createServices();
  vi.mocked(services.fetchProductLots).mockReturnValue(new Promise(() => {}));

  const screen = await renderModal(services);

  await expect
    .element(screen.getByRole("table", { name: "Lotes" }))
    .toHaveAttribute("aria-busy", "true");
});

test("shows a failed load with a retry that reads the lots again", async () => {
  const services = createServices();
  vi.mocked(services.fetchProductLots)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce(lotsOf(expiringLot));
  const screen = await renderModal(services);

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("L-2041")).toBeVisible();
  expect(services.fetchProductLots).toHaveBeenCalledTimes(2);
});

test("ends the session when the cloud says it is over", async () => {
  const services = createServices();
  vi.mocked(services.fetchProductLots).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderModal(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("says the product no longer exists when the cloud does not find it", async () => {
  const services = createServices();
  vi.mocked(services.fetchProductLots).mockResolvedValue({ kind: "not_found" });

  const screen = await renderModal(services);

  await expect.element(screen.getByText("Este producto ya no existe")).toBeVisible();
  expect(screen.getByText("Este producto no tiene lotes con saldo").query()).toBeNull();
});

test("closes from the close button", async () => {
  const onClose = vi.fn();
  const screen = await renderModal(withLots(expiringLot), { onClose });

  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

  expect(onClose).toHaveBeenCalledOnce();
});
