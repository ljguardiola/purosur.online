import { expect, test, vi } from "vitest";
import {
  createServices,
  loaded,
  renderScreen,
} from "./test-support/supplier-price-list-review-screen";
import {
  EVERY_REVIEW_ACTION,
  EXTRACTED_ROWS,
  reviewOf,
  WEB_REREAD_FAILED_LIST,
  WEB_REREADING_LIST,
} from "./test-support/supplier-price-lists";

const rereading = reviewOf(WEB_REREADING_LIST, EXTRACTED_ROWS, EVERY_REVIEW_ACTION);
const rereadFailed = reviewOf(WEB_REREAD_FAILED_LIST, EXTRACTED_ROWS, EVERY_REVIEW_ACTION);

test("a list being read again says so and keeps its rows to review", async () => {
  const screen = await loaded(createServices(), rereading);

  await expect.element(screen.getByText("Actualizando la lista")).toBeVisible();
  await expect
    .element(
      screen.getByText("Se está leyendo la página de nuevo. Cuando termine, se ven los cambios."),
    )
    .toBeVisible();
  await expect.element(screen.getByText("Almendra pelada Nonpareil x 25 kg")).toBeVisible();
});

test("a list being read again reads again on its own until it is done, and shows the merged rows", async () => {
  const services = createServices();
  vi.mocked(services.fetchSupplierPriceListReview)
    .mockResolvedValueOnce({ kind: "ok", value: { kind: "found", review: rereading } })
    .mockResolvedValue({
      kind: "ok",
      value: {
        kind: "found",
        review: reviewOf({ ...WEB_REREADING_LIST, rereading: false }, EXTRACTED_ROWS),
      },
    });
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  try {
    const screen = await renderScreen(services);
    await expect.element(screen.getByText("Actualizando la lista")).toBeVisible();

    vi.advanceTimersByTime(5_000);

    await expect.poll(() => screen.getByText("Actualizando la lista").query()).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test("says the last update failed and why, and that the list was kept as it was", async () => {
  const screen = await loaded(createServices(), rereadFailed);

  await expect.element(screen.getByText("No se pudo actualizar la lista")).toBeVisible();
  await expect
    .element(
      screen.getByText("No se pudo leer el contenido de la página. La lista quedó como estaba."),
    )
    .toBeVisible();
  expect(screen.getByText("Actualizando la lista").query()).toBeNull();
});

test("says nothing about a reread when the list was not read again", async () => {
  const screen = await loaded(
    createServices(),
    reviewOf({ ...WEB_REREADING_LIST, rereading: false }, EXTRACTED_ROWS),
  );

  expect(screen.getByText("Actualizando la lista").query()).toBeNull();
  expect(screen.getByText("No se pudo actualizar la lista").query()).toBeNull();
});
