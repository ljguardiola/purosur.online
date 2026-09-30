import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  adminTarget,
  createServices,
  lucia,
  NO_DEACTIVATE_ACCESS,
  RESET_USER_PIN_ACCESS,
  renderScreen,
  sofia,
} from "./test-support/user-detail-screen";

const issued = {
  kind: "ok",
  value: { code: "K7QM2XPA7DTR4HWN", expiresAt: "2026-09-30T12:15:00.000Z" },
} as const;

test("offers an Administrator to reset a user's PIN, after the passkeys", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("heading", { name: "PIN de la caja" })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Reiniciar el PIN" })).toBeVisible();
  await expect
    .element(
      screen.getByText("El código de reinicio vale 15 minutos y se usa una sola vez en la caja."),
    )
    .toBeVisible();
  const headings = screen.getByRole("heading", { level: 2 }).elements();
  expect(headings.map((heading) => heading.textContent)).toEqual([
    "Datos",
    "Passkeys",
    "PIN de la caja",
  ]);
});

test("offers an Administrator to reset another Administrator's PIN and their own", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: adminTarget });

  const screen = await renderScreen(services, () => {}, "user-4", "user-4");

  await expect.element(screen.getByRole("button", { name: "Reiniciar el PIN" })).toBeVisible();
});

test("offers a holder of reset_user_pin to reset a non-Administrator's PIN", async () => {
  const services = createServices({
    fetchUserPasskeys: vi.fn().mockResolvedValue({ kind: "forbidden" }),
  });
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });

  const screen = await renderScreen(services, () => {}, "user-1", "user-2", RESET_USER_PIN_ACCESS);

  await expect.element(screen.getByRole("heading", { name: "PIN de la caja" })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Reiniciar el PIN" })).toBeVisible();
});

test("hides the PIN section from a holder of reset_user_pin against an Administrator", async () => {
  const services = createServices({
    fetchUserPasskeys: vi.fn().mockResolvedValue({ kind: "forbidden" }),
  });
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: adminTarget });

  const screen = await renderScreen(services, () => {}, "user-4", "user-2", RESET_USER_PIN_ACCESS);

  await expect
    .element(screen.getByRole("heading", { name: "Ana Fernández", level: 1 }))
    .toBeVisible();
  expect(screen.getByRole("heading", { name: "PIN de la caja" }).query()).toBeNull();
  expect(screen.getByRole("button", { name: "Reiniciar el PIN" }).query()).toBeNull();
});

test("hides the PIN section from a holder of reset_user_pin on their own account", async () => {
  const services = createServices({
    fetchUserPasskeys: vi.fn().mockResolvedValue({ kind: "forbidden" }),
  });
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });

  const screen = await renderScreen(services, () => {}, "user-1", "user-1", RESET_USER_PIN_ACCESS);

  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  expect(screen.getByRole("heading", { name: "PIN de la caja" }).query()).toBeNull();
});

test("hides the PIN section without reset_user_pin", async () => {
  const services = createServices({
    fetchUserPasskeys: vi.fn().mockResolvedValue({ kind: "forbidden" }),
  });
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });

  const screen = await renderScreen(services, () => {}, "user-1", "user-2", NO_DEACTIVATE_ACCESS);

  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  expect(screen.getByRole("heading", { name: "PIN de la caja" }).query()).toBeNull();
});

test("hides the PIN section for an inactive user", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: sofia });

  const screen = await renderScreen(services, () => {}, "user-5");

  await expect.element(screen.getByRole("heading", { name: "Sofía Díaz", level: 1 })).toBeVisible();
  expect(screen.getByRole("heading", { name: "PIN de la caja" }).query()).toBeNull();
});

test("hides the PIN section when the user fails to load", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "failed" });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No pudimos abrir este usuario")).toBeVisible();
  expect(screen.getByRole("heading", { name: "PIN de la caja" }).query()).toBeNull();
});

test("Reiniciar el PIN emits a code for the shown user and opens its modal", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.emitUserPinCode).mockResolvedValue(issued);
  const screen = await renderScreen(services);

  await userEvent.click(screen.getByRole("button", { name: "Reiniciar el PIN" }));

  const dialog = screen.getByRole("dialog", { name: "Código para reiniciar el PIN" });
  await expect.element(dialog.getByText("K7QM 2XPA 7DTR 4HWN")).toBeVisible();
  expect(services.emitUserPinCode).toHaveBeenCalledExactlyOnceWith("user-1");
});
