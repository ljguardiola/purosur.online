import type { ExpiringLotList } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  chiaExpiredLot,
  expiringLotList,
  oatsYesterdayLot,
  yogurtTodayLot,
} from "./test-support/expiring-lots-fixtures";
import { createServices, EVERY_LOT, renderScreen } from "./test-support/expiring-lots-screen";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

const DISCARDED = { movementId: "movement-9", quantity: 1_200, balance: 0, superseded: false };

function servicesListing(...lists: ExpiringLotList[]) {
  const services = createServices();
  const read = vi.mocked(services.fetchExpiringLots);
  for (const list of lists) {
    read.mockResolvedValueOnce({ kind: "ok", value: list });
  }
  read.mockResolvedValue({ kind: "ok", value: lists.at(-1) as ExpiringLotList });
  return services;
}

test("offers to discard only the lots that already expired", async () => {
  const screen = await renderScreen(servicesListing(expiringLotList(EVERY_LOT)));

  await expect
    .element(screen.getByRole("button", { name: "Dar de baja el lote L-SC02" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Dar de baja el lote de Avena arrollada" }))
    .toBeVisible();
  expect(screen.getByRole("button", { name: /Dar de baja/ }).elements()).toHaveLength(2);
  await expectNoAccessibilityViolations(screen.container);
});

test("discards the lot in one click, reads the list again and confirms what was discarded", async () => {
  const services = servicesListing(
    expiringLotList(EVERY_LOT),
    expiringLotList([oatsYesterdayLot, yogurtTodayLot]),
  );
  vi.mocked(services.discardExpiredLot).mockResolvedValue({ kind: "ok", value: DISCARDED });
  const screen = await renderScreen(services);

  await userEvent.click(screen.getByRole("button", { name: "Dar de baja el lote L-SC02" }));

  expect(services.discardExpiredLot).toHaveBeenCalledWith(chiaExpiredLot.id);
  await expect.element(screen.getByText("Lote dado de baja")).toBeVisible();
  await expect
    .element(screen.getByText("L-SC02 de Semillas de chía: 1,200 kg como merma por vencimiento."))
    .toBeVisible();
  await expect.poll(() => vi.mocked(services.fetchExpiringLots).mock.calls.length).toBe(2);
  await expect
    .element(screen.getByRole("button", { name: "Dar de baja el lote L-SC02" }))
    .not.toBeInTheDocument();
});

test("names a discarded lot without a number by its product", async () => {
  const services = servicesListing(expiringLotList(EVERY_LOT));
  vi.mocked(services.discardExpiredLot).mockResolvedValue({
    kind: "ok",
    value: { ...DISCARDED, quantity: 2_500 },
  });
  const screen = await renderScreen(services);

  await userEvent.click(
    screen.getByRole("button", { name: "Dar de baja el lote de Avena arrollada" }),
  );

  await expect
    .element(screen.getByText("Avena arrollada: 2,500 kg como merma por vencimiento."))
    .toBeVisible();
});

test("takes the discard away from a lot while its request is on the way", async () => {
  const services = servicesListing(expiringLotList(EVERY_LOT));
  vi.mocked(services.discardExpiredLot).mockReturnValue(new Promise(() => {}));
  const screen = await renderScreen(services);

  await userEvent.click(screen.getByRole("button", { name: "Dar de baja el lote L-SC02" }));

  await expect
    .element(screen.getByRole("button", { name: "Dar de baja el lote L-SC02" }))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("button", { name: "Dar de baja el lote de Avena arrollada" }))
    .toBeVisible();
  expect(services.discardExpiredLot).toHaveBeenCalledTimes(1);
});

test.each([
  [{ kind: "lot_not_expired" }, "El lote todavía no venció."],
  [{ kind: "lot_empty" }, "El lote ya no tiene stock."],
  [{ kind: "not_found" }, "El lote ya no existe."],
  [{ kind: "failed" }, "Probá de nuevo."],
  [{ kind: "validation_failed", field: "lotId" }, "Probá de nuevo."],
  [{ kind: "rate_limited", retryAfterSeconds: 120 }, "Se puede volver a intentar en 2 minutos."],
] as const)("says the lot was not discarded when the cloud answers %j", async (outcome, reason) => {
  const services = servicesListing(expiringLotList(EVERY_LOT));
  vi.mocked(services.discardExpiredLot).mockResolvedValue(outcome);
  const screen = await renderScreen(services);

  await userEvent.click(screen.getByRole("button", { name: "Dar de baja el lote L-SC02" }));

  await expect.element(screen.getByText("No se pudo dar de baja el lote")).toBeVisible();
  await expect.element(screen.getByText(reason)).toBeVisible();
  expect(screen.getByText("Lote dado de baja").query()).toBeNull();
});

test("reads the list again after a refusal, so the lot shown is the one the cloud holds", async () => {
  const services = servicesListing(expiringLotList(EVERY_LOT), expiringLotList([oatsYesterdayLot]));
  vi.mocked(services.discardExpiredLot).mockResolvedValue({ kind: "lot_empty" });
  const screen = await renderScreen(services);

  await userEvent.click(screen.getByRole("button", { name: "Dar de baja el lote L-SC02" }));

  await expect.poll(() => vi.mocked(services.fetchExpiringLots).mock.calls.length).toBe(2);
  await expect.element(screen.getByText("Semillas de chía")).not.toBeInTheDocument();
});

test("offers the discard again after a failure", async () => {
  const services = servicesListing(expiringLotList(EVERY_LOT));
  vi.mocked(services.discardExpiredLot).mockResolvedValue({ kind: "failed" });
  const screen = await renderScreen(services);

  await userEvent.click(screen.getByRole("button", { name: "Dar de baja el lote L-SC02" }));

  await expect.element(screen.getByText("No se pudo dar de baja el lote")).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Dar de baja el lote L-SC02" }))
    .toBeVisible();
});

test("ends the session when the cloud says it is over while discarding", async () => {
  const services = servicesListing(expiringLotList(EVERY_LOT));
  vi.mocked(services.discardExpiredLot).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, { onSessionEnded });

  await userEvent.click(screen.getByRole("button", { name: "Dar de baja el lote L-SC02" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
