import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { resetPageState } from "../shell/test-support/app";
import {
  awaitingRecovery,
  createServices,
  renderScreen,
} from "./test-support/contingency-ticket-rescue-screen";

beforeEach(resetPageState);

function awaiting() {
  const setup = createServices();
  vi.mocked(setup.services.fetchContingencyTicketRecoveries)
    .mockResolvedValueOnce({ kind: "ok", value: { recoveries: [awaitingRecovery] } })
    .mockResolvedValue({ kind: "ok", value: { recoveries: [] } });
  return setup;
}

async function openFinishQuestion(screen: Awaited<ReturnType<typeof renderScreen>>) {
  await userEvent.click(screen.getByRole("button", { name: "Terminar el rescate de Caja 1" }));
  return screen.getByRole("dialog");
}

test("shows no recoveries section when no register awaits its rescue", async () => {
  const { services } = createServices();

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Todavía no se leyó ningún ticket")).toBeVisible();
  expect(screen.getByText("Cajas esperando el rescate de tickets").query()).toBeNull();
  expect(screen.getByText(/revisá la impresora/).query()).toBeNull();
});

test("lists the registers awaiting their rescue with the printer reminder", async () => {
  const { services } = awaiting();

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("table", { name: "Cajas esperando el rescate de tickets" }))
    .toBeVisible();
  await expect.element(screen.getByRole("cell", { name: "Caja 1" })).toBeVisible();
  await expect.element(screen.getByText("14/09/2026 · 17:22")).toBeVisible();
  await expect.element(screen.getByText(/revisá la impresora y el mostrador/)).toBeVisible();
});

test("finishing the rescue asks first and refreshes the list with a notice", async () => {
  const { services, finishContingencyTicketRecovery } = awaiting();
  finishContingencyTicketRecovery.mockResolvedValue({
    kind: "ok",
    value: { outcome: "finished" },
  });
  const screen = await renderScreen(services);
  const dialog = await openFinishQuestion(screen);

  await expect
    .element(dialog.getByRole("heading", { name: "¿Terminar el rescate de Caja 1?" }))
    .toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Terminar el rescate" }));

  await expect.element(screen.getByText("Rescate de Caja 1 terminado")).toBeVisible();
  expect(screen.getByRole("dialog").query()).toBeNull();
  await expect
    .poll(() =>
      screen.getByRole("table", { name: "Cajas esperando el rescate de tickets" }).query(),
    )
    .toBeNull();
});

test.each([
  ["already_finished", "El rescate de Caja 1 ya estaba terminado"],
  ["not_found", "No se encontró el rescate de Caja 1"],
] as const)("tells when the cloud answers %s and refreshes the list", async (outcome, notice) => {
  const { services, finishContingencyTicketRecovery } = awaiting();
  finishContingencyTicketRecovery.mockResolvedValue({
    kind: "ok",
    value: { outcome },
  });
  const screen = await renderScreen(services);
  const dialog = await openFinishQuestion(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Terminar el rescate" }));

  await expect.element(screen.getByText(notice)).toBeVisible();
  expect(services.fetchContingencyTicketRecoveries).toHaveBeenCalledTimes(2);
});

test("cancelling the question leaves the list as it was", async () => {
  const { services } = awaiting();
  const screen = await renderScreen(services);
  const dialog = await openFinishQuestion(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  expect(screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByRole("cell", { name: "Caja 1" })).toBeVisible();
  expect(services.fetchContingencyTicketRecoveries).toHaveBeenCalledTimes(1);
});

test("ends the session when the recoveries come back unauthenticated", async () => {
  const { services } = createServices();
  vi.mocked(services.fetchContingencyTicketRecoveries).mockResolvedValue({
    kind: "unauthenticated",
  });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
