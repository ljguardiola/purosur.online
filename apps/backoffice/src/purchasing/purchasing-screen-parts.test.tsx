import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { render as renderWithRouter } from "../shell/test-support/render-with-router";
import { ExpectedTotalAmount, SupplierFilterButton } from "./purchasing-screen-parts";
import type { fetchSupplierName } from "./suppliers-api";

const SUPPLIER_ID = "5a900000-0000-4000-8000-000000000001";

test("shows the amount in pesos", async () => {
  const screen = await render(<ExpectedTotalAmount cents={555_000} hasUnpricedLine={false} />);

  await expect.element(screen.getByText("$ 5.550,00")).toBeVisible();
  expect(screen.getByText("Hay líneas sin precio de lista").query()).toBeNull();
});

test("warns when some line has no list price", async () => {
  const screen = await render(<ExpectedTotalAmount cents={555_000} hasUnpricedLine />);

  await expect.element(screen.getByText("$ 5.550,00")).toBeVisible();
  await expect.element(screen.getByText("Hay líneas sin precio de lista")).toBeVisible();
});

function renderFilter(
  read: typeof fetchSupplierName,
  { onClear = () => {}, onSessionEnded = () => {} } = {},
) {
  return renderWithRouter(
    <SupplierFilterButton
      supplierFilter={{ supplierId: SUPPLIER_ID, onClear }}
      services={{ fetchSupplierName: read }}
      onSessionEnded={onSessionEnded}
    />,
  );
}

test("names the supplier the cloud answers for the id it filters by", async () => {
  const read = vi.fn<typeof fetchSupplierName>().mockResolvedValue({
    kind: "ok",
    value: { kind: "found", name: "Distribuidora Andina" },
  });

  const screen = await renderFilter(read);

  await expect
    .element(screen.getByRole("button", { name: "Proveedor: Distribuidora Andina" }))
    .toBeVisible();
  expect(read).toHaveBeenCalledWith(SUPPLIER_ID);
});

test("asks to clear the filter when it is pressed, even before the supplier's name arrives", async () => {
  const onClear = vi.fn();
  const screen = await renderFilter(
    vi.fn<typeof fetchSupplierName>().mockReturnValue(new Promise(() => {})),
    { onClear },
  );

  await userEvent.click(screen.getByRole("button", { name: "Proveedor", exact: true }));

  expect(onClear).toHaveBeenCalledOnce();
});

test.each([
  ["no supplier has the id", { kind: "ok", value: { kind: "not_found" } }],
  ["the name could not be read", { kind: "failed" }],
] as const)("reads only Proveedor when %s", async (_case, outcome) => {
  const screen = await renderFilter(vi.fn<typeof fetchSupplierName>().mockResolvedValue(outcome));

  await expect
    .element(screen.getByRole("button", { name: "Proveedor", exact: true }))
    .toBeVisible();
});

test("ends the session when the cloud refuses it", async () => {
  const onSessionEnded = vi.fn();

  await renderFilter(
    vi.fn<typeof fetchSupplierName>().mockResolvedValue({ kind: "unauthenticated" }),
    { onSessionEnded },
  );

  await vi.waitFor(() => expect(onSessionEnded).toHaveBeenCalled());
});
