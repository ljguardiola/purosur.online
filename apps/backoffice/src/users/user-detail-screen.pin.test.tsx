import { expect, test, vi } from "vitest";
import {
  adminTarget,
  createServices,
  lucia,
  NO_DEACTIVATE_ACCESS,
  RESET_USER_PIN_ACCESS,
  renderScreen,
  sofia,
} from "./test-support/user-detail-screen";

test("offers an Administrator to reset a user's PIN, after the passkeys", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Con PIN")).toBeVisible();
  await expect.element(screen.getByText("Con passkeys")).toBeVisible();
});

test("offers an Administrator to reset another Administrator's PIN and their own", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: adminTarget });

  const screen = await renderScreen(services, () => {}, "user-4", "user-4");

  await expect.element(screen.getByText("Con PIN")).toBeVisible();
});

test("offers a holder of reset_user_pin to reset a non-Administrator's PIN", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });

  const screen = await renderScreen(services, () => {}, "user-1", "user-2", RESET_USER_PIN_ACCESS);

  await expect.element(screen.getByText("Con PIN")).toBeVisible();
});

test("hides the PIN section from a holder of reset_user_pin against an Administrator", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({
    kind: "ok",
    value: { ...adminTarget, mayEmitPinCode: false },
  });

  const screen = await renderScreen(services, () => {}, "user-4", "user-2", RESET_USER_PIN_ACCESS);

  await expect
    .element(screen.getByRole("heading", { name: "Ana Fernández", level: 1 }))
    .toBeVisible();
  expect(screen.getByRole("region", { name: "Credenciales" }).query()).toBeNull();
});

test("hides the PIN section from a holder of reset_user_pin on their own account", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({
    kind: "ok",
    value: { ...lucia, mayEmitPinCode: false },
  });

  const screen = await renderScreen(services, () => {}, "user-1", "user-1", RESET_USER_PIN_ACCESS);

  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  expect(screen.getByRole("region", { name: "Credenciales" }).query()).toBeNull();
});

test("hides the PIN section without reset_user_pin", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({
    kind: "ok",
    value: { ...lucia, mayEmitPinCode: false },
  });

  const screen = await renderScreen(services, () => {}, "user-1", "user-2", NO_DEACTIVATE_ACCESS);

  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  expect(screen.getByRole("region", { name: "Credenciales" }).query()).toBeNull();
});

test("hides the PIN section from an Administrator when the cloud answers the PIN code may not be emitted", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({
    kind: "ok",
    value: { ...lucia, mayEmitPinCode: false },
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  await expect.element(screen.getByText("Sin PIN")).toBeVisible();
});

test("hides the PIN section for an inactive user", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: sofia });

  const screen = await renderScreen(services, () => {}, "user-5");

  await expect.element(screen.getByRole("heading", { name: "Sofía Díaz", level: 1 })).toBeVisible();
  await expect.element(screen.getByText("Sin PIN")).toBeVisible();
});

test("while another person's user loads, shows an Administrator no PIN section", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("status").first()).toHaveTextContent("Cargando…");
  await expect.element(screen.getByText("Sin PIN")).toBeVisible();
});

test("while another person's user loads, shows a holder of reset_user_pin no PIN section", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services, () => {}, "user-1", "user-2", RESET_USER_PIN_ACCESS);

  await expect.element(screen.getByRole("status").first()).toHaveTextContent("Cargando…");
  expect(screen.getByRole("region", { name: "Credenciales" }).query()).toBeNull();
});

test("while the user loads, shows an Administrator on their own account the PIN section while the data loads", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services, () => {}, "user-1", "user-1");

  await expect.element(screen.getByText("Con PIN")).toBeVisible();
  await expect.element(screen.getByText("Estado loading")).toBeVisible();
});

test("while their own account loads with its id in another case, shows an Administrator the PIN section while the data loads", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services, () => {}, "ADMIN-1", "admin-1");

  await expect.element(screen.getByText("Con PIN")).toBeVisible();
  await expect.element(screen.getByText("Estado loading")).toBeVisible();
});

test("while the user loads, shows no PIN section to a holder of reset_user_pin on their own account", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services, () => {}, "user-1", "user-1", RESET_USER_PIN_ACCESS);

  await expect.element(screen.getByRole("status").first()).toHaveTextContent("Cargando…");
  expect(screen.getByRole("region", { name: "Credenciales" }).query()).toBeNull();
});

test("while the user loads, shows no PIN section without reset_user_pin", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services, () => {}, "user-1", "user-2", NO_DEACTIVATE_ACCESS);

  await expect.element(screen.getByRole("status").first()).toHaveTextContent("Cargando…");
  expect(screen.getByRole("region", { name: "Credenciales" }).query()).toBeNull();
});

test("after another person's user fails to load, shows no PIN section", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "failed" });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No pudimos abrir este usuario")).toBeVisible();
  await expect.element(screen.getByText("Sin PIN")).toBeVisible();
});

test("after their own account fails to load, shows an Administrator the PIN section with the data failed", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "failed" });

  const screen = await renderScreen(services, () => {}, "user-1", "user-1");

  await expect.element(screen.getByText("No pudimos abrir este usuario")).toBeVisible();
  await expect.element(screen.getByText("Con PIN")).toBeVisible();
  await expect.element(screen.getByText("Estado failed")).toBeVisible();
});
