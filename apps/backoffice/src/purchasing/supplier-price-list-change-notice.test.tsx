import { expect, test } from "vitest";
import { render } from "../shell/test-support/render-with-router";
import {
  SupplierPriceListChangeNotices,
  supplierPriceListChangeNoticeOf,
  supplierPriceListChangeOutdates,
} from "./supplier-price-list-change-notice";

test.each([
  [{ kind: "failed" }, { kind: "attemptFailed" }],
  [{ kind: "validation_failed", field: "version" }, { kind: "attemptFailed" }],
  [
    { kind: "rate_limited", retryAfterSeconds: 60 },
    { kind: "rateLimited", retryAfterSeconds: 60 },
  ],
  [{ kind: "stale_version" }, { kind: "stale" }],
  [{ kind: "not_editable" }, { kind: "notEditable" }],
  [{ kind: "not_found" }, { kind: "notFound" }],
  [{ kind: "no_rows" }, { kind: "noRows" }],
  [{ kind: "unpriced_rows" }, { kind: "unpricedRows" }],
  [{ kind: "list_date_missing" }, { kind: "listDateMissing" }],
] as const)("turns the outcome %j into the notice %j", (outcome, notice) => {
  expect(supplierPriceListChangeNoticeOf(outcome)).toEqual(notice);
});

test("a notice says the list changed only when what the person saw is out of date", () => {
  expect(supplierPriceListChangeOutdates({ kind: "stale" })).toBe(true);
  expect(supplierPriceListChangeOutdates({ kind: "notEditable" })).toBe(true);
  expect(supplierPriceListChangeOutdates({ kind: "notFound" })).toBe(true);
  expect(supplierPriceListChangeOutdates({ kind: "attemptFailed" })).toBe(false);
  expect(supplierPriceListChangeOutdates({ kind: "unpricedRows" })).toBe(false);
  expect(supplierPriceListChangeOutdates(null)).toBe(false);
});

test.each([
  [{ kind: "attemptFailed" }, "No se guardó el cambio", "Volvé a intentarlo."],
  [
    { kind: "rateLimited", retryAfterSeconds: 120 },
    "Demasiadas solicitudes",
    "Se puede volver a intentar en 2 minutos.",
  ],
  [{ kind: "stale" }, "La lista cambió", "Actualizala para ver los cambios y volvé a intentarlo."],
  [{ kind: "notEditable" }, "La lista ya no se puede modificar", undefined],
  [{ kind: "notFound" }, "Esta lista ya no existe", undefined],
  [{ kind: "noRows" }, "La lista no tiene ítems", "Cargá otra lista o descartá esta."],
  [
    { kind: "unpricedRows" },
    "Hay ítems sin precio",
    "Escribí el precio de cada uno o quitalos antes de confirmar.",
  ],
] as const)("shows the notice %j", async (notice, title, description) => {
  const screen = await render(
    <SupplierPriceListChangeNotices notice={notice} failedTitle="No se guardó el cambio" />,
  );

  await expect.element(screen.getByRole("alert")).toHaveTextContent(title);
  if (description !== undefined) {
    await expect.element(screen.getByRole("alert")).toHaveTextContent(description);
  }
});

test("shows nothing without a notice, and leaves a missing date to its field", async () => {
  const none = await render(
    <SupplierPriceListChangeNotices notice={null} failedTitle="No se guardó el cambio" />,
  );
  expect(none.getByRole("alert").query()).toBeNull();

  const date = await render(
    <SupplierPriceListChangeNotices
      notice={{ kind: "listDateMissing" }}
      failedTitle="No se guardó el cambio"
    />,
  );
  expect(date.getByRole("alert").query()).toBeNull();
});
