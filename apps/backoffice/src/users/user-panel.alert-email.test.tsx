import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { createServices, lucia, renderScreen } from "./test-support/user-panel";

const optedInLucia = {
  ...lucia,
  alertEmailOptedInAt: "2026-03-14T15:00:00.000Z",
  mayWithdrawAlertEmailOptIn: true,
};

beforeEach(async () => {
  await page.viewport(1280, 900);
  window.history.pushState(null, "", "/");
});

test("shows an Administrator whether another user receives alerts by email, with the action to stop it", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: optedInLucia });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Recibe alertas por email desde 14/03/2026")).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Dejar de recibir alertas por email" }))
    .toBeVisible();
  expect(screen.getByRole("button", { name: "Recibir alertas por email" }).query()).toBeNull();
});

test("offers no action on a user who does not receive alerts by email", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No recibe alertas por email")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Dejar de recibir alertas por email" }).query(),
  ).toBeNull();
  expect(screen.getByRole("button", { name: "Recibir alertas por email" }).query()).toBeNull();
});

test("offers no action on a user who receives alerts by email when the cloud answers it may not be stopped", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({
    kind: "ok",
    value: { ...optedInLucia, active: false, mayWithdrawAlertEmailOptIn: false },
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Recibe alertas por email desde 14/03/2026")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Dejar de recibir alertas por email" }).query(),
  ).toBeNull();
});

test("shows no action while the user loads", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("complementary", { name: "Usuario" })).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Dejar de recibir alertas por email" }).query(),
  ).toBeNull();
});

test("withdraws the user's opt-in after confirming, reading the user again", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser)
    .mockResolvedValueOnce({ kind: "ok", value: optedInLucia })
    .mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.withdrawUserAlertEmailOptIn).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);

  await userEvent.click(screen.getByRole("button", { name: "Dejar de recibir alertas por email" }));
  const dialog = screen.getByRole("dialog", {
    name: "¿Dejar de enviar alertas por email a Lucía?",
  });
  await userEvent.click(dialog.getByRole("button", { name: "Dejar de recibir alertas por email" }));

  await expect.element(screen.getByText("No recibe alertas por email")).toBeVisible();
  expect(services.withdrawUserAlertEmailOptIn).toHaveBeenCalledWith("user-1");
  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("Cancelar closes the confirmation without withdrawing", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: optedInLucia });
  const screen = await renderScreen(services);

  await userEvent.click(screen.getByRole("button", { name: "Dejar de recibir alertas por email" }));
  const dialog = screen.getByRole("dialog", {
    name: "¿Dejar de enviar alertas por email a Lucía?",
  });
  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.withdrawUserAlertEmailOptIn).not.toHaveBeenCalled();
});

test("shows the not-found state when the withdrawal finds the user gone", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser)
    .mockResolvedValueOnce({ kind: "ok", value: optedInLucia })
    .mockResolvedValue({ kind: "not_found" });
  vi.mocked(services.withdrawUserAlertEmailOptIn).mockResolvedValue({ kind: "not_found" });
  const screen = await renderScreen(services);

  await userEvent.click(screen.getByRole("button", { name: "Dejar de recibir alertas por email" }));
  const dialog = screen.getByRole("dialog", {
    name: "¿Dejar de enviar alertas por email a Lucía?",
  });
  await userEvent.click(dialog.getByRole("button", { name: "Dejar de recibir alertas por email" }));

  await expect.element(screen.getByRole("alert")).toHaveTextContent("No encontramos este usuario");
});
