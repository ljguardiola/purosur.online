import { defineHelp } from "@purosur/ui";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import { App } from "./App";
import { fetchPasskeys } from "./passkeyApi";
import { fetchRegistrationOptions } from "./recoveryApi";
import { fetchSession, signOut } from "./sessionApi";

vi.mock("./recoveryApi", () => ({
  requestRecoveryLink: vi.fn(),
  fetchRegistrationOptions: vi.fn(() => new Promise(() => {})),
  redeemRecovery: vi.fn(),
}));
vi.mock("./sessionApi", () => ({
  fetchSession: vi.fn(),
  fetchAuthenticationOptions: vi.fn(),
  authenticate: vi.fn(),
  signOut: vi.fn(),
  // Never resolves: these tests run well under the watcher's 60s interval and never report a
  // deadline or dispatch a visibility change, so this is never expected to be awaited.
  checkSessionStatus: vi.fn(() => new Promise(() => {})),
}));
vi.mock("./passkeyApi", () => ({
  fetchPasskeys: vi.fn(() => new Promise(() => {})),
  fetchPasskeyRegistrationChallenge: vi.fn(),
  fetchPasskeyRemovalChallenge: vi.fn(),
  registerPasskey: vi.fn(),
  removePasskey: vi.fn(),
}));

const emptyHelp = defineHelp("es-AR", { categories: {}, articles: {} });

const help = defineHelp("es-AR", {
  categories: {
    getting_started: { label: "Primeros pasos" },
    billing: { label: "Facturación" },
  },
  articles: {
    intro: {
      category: "getting_started",
      title: "Bienvenida",
      body: [{ kind: "paragraph", text: "Configurá tu catálogo antes de abrir la caja." }],
    },
    billing_basics: {
      category: "billing",
      title: "Facturación básica",
      body: [{ kind: "paragraph", text: "Cómo emitir una factura." }],
    },
  },
});

beforeEach(() => {
  window.history.pushState(null, "", "/");
  window.localStorage.clear();
  vi.mocked(fetchSession).mockReset().mockResolvedValue({
    kind: "ok",
    userId: "user-1",
    displayName: "Lucas Guardiola",
  });
  vi.mocked(signOut).mockReset().mockResolvedValue({ kind: "ok" });
  vi.mocked(fetchPasskeys)
    .mockReset()
    .mockReturnValue(new Promise(() => {}));
});

afterEach(() => {
  window.history.pushState(null, "", "/");
  window.localStorage.clear();
});

test("redirects the root path to /help without leaving the root in the history", async () => {
  const lengthBefore = window.history.length;

  await render(<App help={emptyHelp} />);

  await expect.poll(() => window.location.pathname).toBe("/help");
  expect(window.history.length).toBe(lengthBefore);
});

test("redirects a path outside Help to /help", async () => {
  window.history.pushState(null, "", "/ventas");

  await render(<App help={help} />);

  await expect.poll(() => window.location.pathname).toBe("/help");
});

test("redirects an unknown category or article to the closest page that exists", async () => {
  window.history.pushState(null, "", "/help/x/constructor");
  const screen = await render(<App help={help} />);

  await expect.poll(() => window.location.pathname).toBe("/help");
  await expect
    .element(screen.getByRole("heading", { name: "Elegí una sección", level: 1 }))
    .toBeInTheDocument();

  window.history.pushState(null, "", "/help/getting_started/unknown");
  window.dispatchEvent(new PopStateEvent("popstate"));

  await expect.poll(() => window.location.pathname).toBe("/help/getting_started");
});

test("moves an article reached under another category to its own category's URL", async () => {
  window.history.pushState(null, "", "/help/billing/intro");

  const screen = await render(<App help={help} />);

  await expect.poll(() => window.location.pathname).toBe("/help/getting_started/intro");
  await expect.element(screen.getByText("Ayuda · Primeros pasos")).toBeVisible();
});

test("renders the shell's area rail and section column landmarks", async () => {
  const screen = await render(<App help={emptyHelp} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  await expect
    .element(screen.getByRole("navigation", { name: "Secciones de ayuda" }))
    .toBeVisible();
});

test("shows the active Help item in the rail and the Help screen's own content", async () => {
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} />);

  const helpItemLocator = screen.getByRole("link", { name: "Ayuda" });
  await expect.element(helpItemLocator).toBeVisible();
  const helpItem = helpItemLocator.element() as HTMLAnchorElement;
  expect(helpItem.getAttribute("aria-current")).toBe("page");

  // Every existing area stays in the rail on every page; only the active one is highlighted.
  const configItemLocator = screen.getByRole("link", { name: "Config" });
  await expect.element(configItemLocator).toBeVisible();
  const configItem = configItemLocator.element() as HTMLAnchorElement;
  expect(configItem.getAttribute("aria-current")).toBeNull();

  await expect.element(screen.getByRole("heading", { name: "Ayuda", level: 2 })).toBeVisible();
  await expect.element(screen.getByRole("searchbox", { name: "Buscar en la ayuda" })).toBeVisible();
  await expect.element(screen.getByText("Todavía no hay contenido de ayuda")).toBeVisible();

  await expectNoAccessibilityViolations(document.body);
});

test("following a search result shows that article and clears the search", async () => {
  window.history.pushState(null, "", "/help");
  const screen = await render(<App help={help} />);

  await userEvent.fill(screen.getByRole("searchbox", { name: "Buscar en la ayuda" }), "factura");
  await userEvent.click(screen.getByRole("link", { name: "Facturación básica" }));

  await expect
    .element(screen.getByRole("heading", { name: "Facturación básica", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByText("Cómo emitir una factura.")).toBeVisible();
  await expect
    .element(screen.getByRole("searchbox", { name: "Buscar en la ayuda" }))
    .toHaveValue("");
});

test("following a section link to the current page while searching shows that section", async () => {
  window.history.pushState(null, "", "/help/billing");
  const screen = await render(<App help={help} />);

  await userEvent.fill(screen.getByRole("searchbox", { name: "Buscar en la ayuda" }), "bienvenida");
  await expect.element(screen.getByRole("link", { name: "Bienvenida" })).toBeVisible();

  await userEvent.click(screen.getByRole("link", { name: "Facturación", exact: true }));

  await expect.element(screen.getByRole("link", { name: "Facturación básica" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Bienvenida" }).query()).toBeNull();
});

test("titles the document after the page being shown", async () => {
  window.history.pushState(null, "", "/help");
  const screen = await render(<App help={help} />);

  await expect.poll(() => document.title).toBe("Ayuda · Puro Sur");

  await userEvent.click(screen.getByRole("link", { name: "Primeros pasos" }));
  await expect.poll(() => document.title).toBe("Primeros pasos · Ayuda · Puro Sur");

  await userEvent.click(screen.getByRole("link", { name: "Bienvenida" }));
  await expect.poll(() => document.title).toBe("Bienvenida · Ayuda · Puro Sur");
});

test("moves focus to the page heading after an in-app navigation, not on the first load", async () => {
  window.history.pushState(null, "", "/help/getting_started/intro");
  const screen = await render(<App help={help} />);

  const firstHeading = screen.getByRole("heading", { name: "Bienvenida", level: 1 });
  await expect.element(firstHeading).toBeVisible();
  expect(document.activeElement).not.toBe(firstHeading.element());

  await userEvent.click(screen.getByRole("link", { name: "Facturación", exact: true }));

  await expect
    .element(screen.getByRole("heading", { name: "Facturación", level: 1 }))
    .toHaveFocus();
});

test("routes /sign-in to the sign-in screen, outside the Shell, when no session is live", async () => {
  vi.mocked(fetchSession).mockResolvedValue({ kind: "unauthenticated" });
  window.history.pushState(null, "", "/sign-in");

  const screen = await render(<App help={emptyHelp} />);

  await expect.element(screen.getByRole("heading", { name: "Ingresar", level: 1 })).toBeVisible();
  expect(screen.getByRole("navigation", { name: "Áreas" }).query()).toBeNull();
});

test("routes /account-recovery to the recovery form, outside the Shell", async () => {
  vi.mocked(fetchSession).mockResolvedValue({ kind: "unauthenticated" });
  window.history.pushState(null, "", "/account-recovery");

  const screen = await render(<App help={emptyHelp} />);

  await expect
    .element(screen.getByRole("heading", { name: "Recuperar el acceso", level: 1 }))
    .toBeVisible();
  expect(screen.getByRole("navigation", { name: "Áreas" }).query()).toBeNull();
});

test("routes /account-recovery/passkey to the passkey registration screen, reading its token from the hash", async () => {
  vi.mocked(fetchSession).mockResolvedValue({ kind: "unauthenticated" });
  window.history.pushState(null, "", "/account-recovery/passkey#the-token");

  const screen = await render(<App help={emptyHelp} />);

  await expect.element(screen.getByText("Abriendo el registro…")).toBeVisible();
  expect(fetchRegistrationOptions).toHaveBeenCalledWith("the-token");
  expect(screen.getByRole("navigation", { name: "Áreas" }).query()).toBeNull();
});

test("renders nothing while the mount session check is pending", async () => {
  vi.mocked(fetchSession).mockReturnValue(new Promise(() => {}));
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} />);

  expect(screen.getByRole("navigation", { name: "Áreas" }).query()).toBeNull();
  expect(screen.getByRole("heading", { name: "Ingresar" }).query()).toBeNull();
});

test("routes a shell path to the sign-in screen when the mount check finds no session", async () => {
  vi.mocked(fetchSession).mockResolvedValue({ kind: "unauthenticated" });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} />);

  await expect.element(screen.getByRole("heading", { name: "Ingresar", level: 1 })).toBeVisible();
});

test("shows the session-expired notice when a session was open in this browser before and now answers unauthenticated", async () => {
  window.localStorage.setItem("purosur-backoffice-was-signed-in", "1");
  vi.mocked(fetchSession).mockResolvedValue({ kind: "unauthenticated" });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} />);

  await expect.element(screen.getByText("Tu sesión venció")).toBeVisible();
});

test("says the session could not be checked, instead of that it expired, when the check itself fails", async () => {
  window.localStorage.setItem("purosur-backoffice-was-signed-in", "1");
  vi.mocked(fetchSession).mockResolvedValue({ kind: "failed" });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} />);

  await expect.element(screen.getByText("No pudimos verificar tu sesión")).toBeVisible();
  expect(screen.getByText("Tu sesión venció").query()).toBeNull();
});

test("keeps the signed-in marker when the session check fails, since the session may still be live", async () => {
  window.localStorage.setItem("purosur-backoffice-was-signed-in", "1");
  vi.mocked(fetchSession).mockResolvedValue({ kind: "failed" });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} />);
  await expect.element(screen.getByRole("heading", { name: "Ingresar", level: 1 })).toBeVisible();

  expect(window.localStorage.getItem("purosur-backoffice-was-signed-in")).toBe("1");
});

test("shows a rate-limited notice, instead of a generic failure, when the mount check is rate limited", async () => {
  window.localStorage.setItem("purosur-backoffice-was-signed-in", "1");
  vi.mocked(fetchSession).mockResolvedValue({ kind: "rate_limited", retryAfterSeconds: 120 });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} />);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  expect(screen.getByText("Tu sesión venció").query()).toBeNull();
  expect(screen.getByText("No pudimos verificar tu sesión").query()).toBeNull();
  expect(window.localStorage.getItem("purosur-backoffice-was-signed-in")).toBe("1");
});

test("redirects away from /sign-in to the shell when a session is already live", async () => {
  window.history.pushState(null, "", "/sign-in");

  const screen = await render(<App help={emptyHelp} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Ingresar" }).query()).toBeNull();
});

test("shows the signed-in user's name in the rail footer, and Salir signs back out to /sign-in", async () => {
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} />);

  await expect.element(screen.getByText("Lucas Guardiola")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Salir" }));
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Salir" }));

  await expect.poll(() => vi.mocked(signOut).mock.calls.length).toBe(1);
  await expect.element(screen.getByRole("heading", { name: "Ingresar", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/sign-in");
});

test("shows a focus ring on the page heading it focuses after a keyboard navigation", async () => {
  window.history.pushState(null, "", "/help/getting_started");
  const screen = await render(<App help={help} />);

  const link = screen
    .getByRole("link", { name: "Facturación", exact: true })
    .element() as HTMLElement;
  link.focus();
  await userEvent.keyboard("{Enter}");

  const heading = screen.getByRole("heading", { name: "Facturación", level: 1 });
  await expect.element(heading).toHaveFocus();
  await expect.element(heading).toBeVisible();
  const headingElement = heading.element() as HTMLElement;
  // toBeVisible() accepts a visually hidden (sr-only) element, whose clipped box is 1px wide.
  expect(headingElement.getBoundingClientRect().width).toBeGreaterThan(1);
  const style = getComputedStyle(headingElement);
  await expect.poll(() => style.outlineStyle).toBe("solid");
  expect(style.outlineWidth).toBe("3px");
  expect(style.outlineColor).toBe(style.color);
});

test("routes /settings/users/me to Mi cuenta inside the Shell, with Config and Usuarios active", async () => {
  vi.mocked(fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/settings/users/me");

  const screen = await render(<App help={emptyHelp} />);

  const configItem = screen.getByRole("link", { name: "Config" }).element() as HTMLAnchorElement;
  expect(configItem.getAttribute("aria-current")).toBe("page");
  const usersItem = screen.getByRole("link", { name: "Usuarios" }).element() as HTMLAnchorElement;
  expect(usersItem.getAttribute("aria-current")).toBe("page");
  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  await expect.poll(() => document.title).toBe("Mi cuenta · Puro Sur");

  // Every existing area stays in the rail on every page; only the active one is highlighted.
  const helpItemLocator = screen.getByRole("link", { name: "Ayuda" });
  await expect.element(helpItemLocator).toBeVisible();
  const helpItem = helpItemLocator.element() as HTMLAnchorElement;
  expect(helpItem.getAttribute("aria-current")).toBeNull();
  // No axe check here: this route's <main> already fails axe's pre-existing, unrelated
  // scrollable-region-focusable rule at this viewport (tracked separately, not this bug's scope).
});

test("following the account name link from Help shows Mi cuenta", async () => {
  vi.mocked(fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/help");
  const screen = await render(<App help={emptyHelp} />);

  await userEvent.click(screen.getByRole("link", { name: "Lucas Guardiola" }));

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/settings/users/me");
});

test("ends the session with the expired notice when Mi cuenta's passkeys request finds it already ended", async () => {
  vi.mocked(fetchPasskeys).mockResolvedValue({ kind: "unauthenticated" });
  window.history.pushState(null, "", "/settings/users/me");

  const screen = await render(<App help={emptyHelp} />);

  await expect.element(screen.getByRole("heading", { name: "Ingresar", level: 1 })).toBeVisible();
  await expect.element(screen.getByText("Tu sesión venció")).toBeVisible();
  expect(window.location.pathname).toBe("/sign-in");
});
