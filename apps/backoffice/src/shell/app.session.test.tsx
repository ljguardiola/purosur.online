import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { honey } from "../catalog/test-support/products";
import { openSession } from "../sessions/test-support/open-session";
import { App, type AppServices } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

const PAST_ACTIVITY_THROTTLE_WINDOW_MS = 120_000;

opensOnlyScreens([
  "/",
  "/account",
  "/account-recovery",
  "/account-recovery/passkey",
  "/help",
  "/products",
  "/sign-in",
  "/users",
]);

beforeEach(resetPageState);

afterEach(resetPageState);

test("routes /sign-in to the sign-in screen, outside the Shell, when no session is live", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue({ kind: "unauthenticated" }),
  });
  window.history.pushState(null, "", "/sign-in");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Ingresar", level: 1 })).toBeVisible();
  expect(screen.getByRole("navigation", { name: "Áreas" }).query()).toBeNull();
});

test("routes /account-recovery to the recovery form, outside the Shell", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue({ kind: "unauthenticated" }),
  });
  window.history.pushState(null, "", "/account-recovery");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Recuperar el acceso", level: 1 }))
    .toBeVisible();
  expect(screen.getByRole("navigation", { name: "Áreas" }).query()).toBeNull();
});

test("routes /account-recovery/passkey to the passkey registration screen, reading its token from the hash", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue({ kind: "unauthenticated" }),
  });
  window.history.pushState(null, "", "/account-recovery/passkey#the-token");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("status")).toHaveTextContent("Cargando…");
  await expect
    .poll(() => services.registerPasskeyScreen.fetchRegistrationOptions)
    .toHaveBeenCalledWith("the-token");
  expect(screen.getByRole("navigation", { name: "Áreas" }).query()).toBeNull();
});

test("renders nothing while the mount session check is pending", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockReturnValue(new Promise(() => {})),
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  expect(screen.getByRole("navigation", { name: "Áreas" }).query()).toBeNull();
  expect(screen.getByRole("heading", { name: "Ingresar" }).query()).toBeNull();
});

test("routes a shell path to the sign-in screen when the mount check finds no session", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue({ kind: "unauthenticated" }),
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Ingresar", level: 1 })).toBeVisible();
});

test("routes the root address to the sign-in screen when the mount check finds no session", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue({ kind: "unauthenticated" }),
  });
  window.history.pushState(null, "", "/");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Ingresar", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/sign-in");
});

test("shows the session-expired notice when a session was open in this browser before and now answers unauthenticated", async () => {
  window.localStorage.setItem("purosur-backoffice-was-signed-in", "1");
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue({ kind: "unauthenticated" }),
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByText("Tu sesión venció")).toBeVisible();
});

test("says the session could not be checked, instead of that it expired, when the check itself fails", async () => {
  window.localStorage.setItem("purosur-backoffice-was-signed-in", "1");
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue({ kind: "failed" }),
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByText("No pudimos verificar tu sesión")).toBeVisible();
  expect(screen.getByText("Tu sesión venció").query()).toBeNull();
});

test("keeps the signed-in marker when the session check fails, since the session may still be live", async () => {
  window.localStorage.setItem("purosur-backoffice-was-signed-in", "1");
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue({ kind: "failed" }),
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("heading", { name: "Ingresar", level: 1 })).toBeVisible();

  expect(window.localStorage.getItem("purosur-backoffice-was-signed-in")).toBe("1");
});

test("shows a rate-limited notice, instead of a generic failure, when the mount check is rate limited", async () => {
  window.localStorage.setItem("purosur-backoffice-was-signed-in", "1");
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue({ kind: "rate_limited", retryAfterSeconds: 120 }),
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  expect(screen.getByText("Tu sesión venció").query()).toBeNull();
  expect(screen.getByText("No pudimos verificar tu sesión").query()).toBeNull();
  expect(window.localStorage.getItem("purosur-backoffice-was-signed-in")).toBe("1");
});

test("redirects away from /sign-in to the shell when a session is already live", async () => {
  window.history.pushState(null, "", "/sign-in");

  const screen = await render(<App help={emptyHelp} services={createAppServices()} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Ingresar" }).query()).toBeNull();
});

test("shows the signed-in user's name in the rail footer, and Salir signs back out to /sign-in", async () => {
  window.history.pushState(null, "", "/help");
  const services = createAppServices();

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByText("Lucas Medrano")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Salir" }));
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Salir" }));

  await expect.poll(() => vi.mocked(services.accountFooter.signOut).mock.calls.length).toBe(1);
  await expect.element(screen.getByRole("heading", { name: "Ingresar", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/sign-in");
});

test("a list the previous person had open is read again from the loading placeholder after signing out and back in", async () => {
  window.history.pushState(null, "", "/products");
  const services = createAppServices();
  vi.mocked(services.productsListScreen.fetchProducts).mockResolvedValue({
    kind: "ok",
    value: [honey],
  });
  vi.mocked(services.productsListScreen.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  vi.mocked(services.signInScreen.fetchAuthenticationOptions).mockResolvedValue({
    kind: "ok",
    value: { challenge: "challenge" },
  });
  vi.mocked(services.signInScreen.startAuthentication).mockResolvedValue(
    {} as Awaited<ReturnType<AppServices["signInScreen"]["startAuthentication"]>>,
  );
  vi.mocked(services.signInScreen.authenticate).mockResolvedValue({ kind: "ok" });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByText(honey.name)).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Salir" }));
  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Salir" }));
  vi.mocked(services.productsListScreen.fetchProducts).mockReturnValue(new Promise(() => {}));
  await userEvent.click(screen.getByRole("button", { name: "Ingresar con passkey" }));

  await userEvent.click(screen.getByRole("link", { name: "Catálogo" }));

  await expect
    .element(screen.getByRole("table", { name: "Productos" }))
    .toHaveAttribute("aria-busy", "true");
  expect(screen.getByText(honey.name).query()).toBeNull();
});

test("follows a demotion reported by real use of the open tab: Usuarios and Roles leave the rail and the Users list gives way to Mi cuenta", async () => {
  const services = createAppServices();
  vi.mocked(services.usersListScreen.fetchUsers).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.usersListScreen.fetchRoles).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/users");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("link", { name: "Roles" })).toBeVisible();

  vi.mocked(services.fetchSession).mockResolvedValue(openSession({ isAdministrator: false }));
  vi.setSystemTime(Date.now() + PAST_ACTIVITY_THROTTLE_WINDOW_MS);
  try {
    window.dispatchEvent(new KeyboardEvent("keydown"));

    await expect
      .element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 }))
      .toBeVisible();
    expect(window.location.pathname).toBe("/account");
    expect(screen.getByRole("link", { name: "Roles" }).query()).toBeNull();
    expect(screen.getByRole("link", { name: "Usuarios" }).query()).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test("follows a promotion reported by real use of the open tab: Usuarios and Roles join the rail", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Villalba", isAdministrator: false }),
      ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/account");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(screen.getByRole("link", { name: "Roles" }).query()).toBeNull();

  vi.mocked(services.fetchSession).mockResolvedValue(
    openSession({ userId: "user-2", displayName: "Grace Villalba" }),
  );
  vi.setSystemTime(Date.now() + PAST_ACTIVITY_THROTTLE_WINDOW_MS);
  try {
    window.dispatchEvent(new KeyboardEvent("keydown"));

    await expect.element(screen.getByRole("link", { name: "Roles" })).toBeVisible();
    await expect.element(screen.getByRole("link", { name: "Usuarios" })).toBeVisible();
  } finally {
    vi.useRealTimers();
  }
});

test("ends the session with the expired notice when Mi cuenta's passkeys request finds it already ended", async () => {
  const services = createAppServices();
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({
    kind: "unauthenticated",
  });
  window.history.pushState(null, "", "/account");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Ingresar", level: 1 })).toBeVisible();
  await expect.element(screen.getByText("Tu sesión venció")).toBeVisible();
  expect(window.location.pathname).toBe("/sign-in");
});

test("ends the session with the expired notice when the open tab's status check finds it already ended", async () => {
  const services = createAppServices();
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();

  vi.mocked(services.checkSessionStatus).mockResolvedValue({ kind: "unauthenticated" });
  document.dispatchEvent(new Event("visibilitychange"));

  await expect.element(screen.getByRole("heading", { name: "Ingresar", level: 1 })).toBeVisible();
  await expect.element(screen.getByText("Tu sesión venció")).toBeVisible();
  expect(window.location.pathname).toBe("/sign-in");
});

test("ends the session with the expired notice when real use of the open tab finds it already ended", async () => {
  window.history.pushState(null, "", "/help");
  const services = createAppServices();
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();

  vi.mocked(services.fetchSession).mockResolvedValue({ kind: "unauthenticated" });
  vi.setSystemTime(Date.now() + PAST_ACTIVITY_THROTTLE_WINDOW_MS);
  try {
    await userEvent.click(screen.getByRole("searchbox", { name: "Buscar en la ayuda" }));

    await expect.element(screen.getByRole("heading", { name: "Ingresar", level: 1 })).toBeVisible();
    await expect.element(screen.getByText("Tu sesión venció")).toBeVisible();
    expect(window.location.pathname).toBe("/sign-in");
  } finally {
    vi.useRealTimers();
  }
});
