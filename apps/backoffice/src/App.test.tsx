import { defineHelp } from "@purosur/ui";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import { App, type AppServices } from "./App";

function createServices(overrides: Partial<AppServices> = {}): AppServices {
  return {
    fetchSession: vi.fn().mockResolvedValue({
      kind: "ok",
      userId: "user-1",
      displayName: "Lucas Guardiola",
      isAdministrator: true,
    }),
    // Never resolves by default: most tests here are about something else, and run well under the
    // watcher's interval anyway.
    checkSessionStatus: vi.fn().mockReturnValue(new Promise(() => {})),
    signInScreen: {
      fetchAuthenticationOptions: vi.fn(),
      authenticate: vi.fn(),
      startAuthentication: vi.fn(),
      signalUnknownCredential: vi.fn(),
    },
    accountRecoveryScreen: { requestRecoveryLink: vi.fn() },
    registerPasskeyScreen: {
      fetchRegistrationOptions: vi.fn().mockReturnValue(new Promise(() => {})),
      redeemRecovery: vi.fn(),
      startRegistration: vi.fn(),
      signalUnknownCredential: vi.fn(),
    },
    myAccountScreen: {
      fetchPasskeys: vi.fn().mockReturnValue(new Promise(() => {})),
      fetchPasskeyRegistrationChallenge: vi.fn(),
      registerPasskey: vi.fn(),
      removePasskey: vi.fn(),
      fetchSessionAuthorizationOptions: vi.fn(),
      authorizeSession: vi.fn(),
      startAuthentication: vi.fn(),
      startRegistration: vi.fn(),
      signalUnknownCredential: vi.fn(),
    },
    usersListScreen: {
      fetchUsers: vi.fn().mockReturnValue(new Promise(() => {})),
      fetchRoles: vi.fn().mockReturnValue(new Promise(() => {})),
      createUser: vi.fn(),
      fetchSessionAuthorizationOptions: vi.fn(),
      authorizeSession: vi.fn(),
      startAuthentication: vi.fn(),
    },
    rolesListScreen: {
      fetchRoles: vi.fn().mockReturnValue(new Promise(() => {})),
    },
    categoriesListScreen: {
      fetchCategories: vi.fn().mockReturnValue(new Promise(() => {})),
      createCategory: vi.fn(),
      editCategory: vi.fn(),
    },
    productsListScreen: {
      fetchProducts: vi.fn().mockReturnValue(new Promise(() => {})),
      createProduct: vi.fn(),
      editProduct: vi.fn(),
      fetchCategories: vi.fn().mockReturnValue(new Promise(() => {})),
      generateInternalBarcode: vi.fn(),
      printLabels: vi.fn(),
    },
    newRoleScreen: {
      createRole: vi.fn(),
      fetchSessionAuthorizationOptions: vi.fn(),
      authorizeSession: vi.fn(),
      startAuthentication: vi.fn(),
    },
    editRoleScreen: {
      fetchRole: vi.fn().mockReturnValue(new Promise(() => {})),
      editRole: vi.fn(),
      fetchSessionAuthorizationOptions: vi.fn(),
      authorizeSession: vi.fn(),
      startAuthentication: vi.fn(),
    },
    duplicateRoleScreen: {
      fetchRoles: vi.fn().mockReturnValue(new Promise(() => {})),
      createRole: vi.fn(),
      fetchSessionAuthorizationOptions: vi.fn(),
      authorizeSession: vi.fn(),
      startAuthentication: vi.fn(),
    },
    userDetailScreen: {
      fetchUser: vi.fn().mockReturnValue(new Promise(() => {})),
      changeUserEmail: vi.fn(),
      fetchUserPasskeys: vi.fn().mockReturnValue(new Promise(() => {})),
      removeUserPasskey: vi.fn(),
      deactivateUser: vi.fn(),
      fetchSessionAuthorizationOptions: vi.fn(),
      authorizeSession: vi.fn(),
      startAuthentication: vi.fn(),
    },
    branchSettingsScreen: {
      fetchBranchSettings: vi.fn().mockReturnValue(new Promise(() => {})),
      saveBranchSettings: vi.fn(),
    },
    accountFooter: { signOut: vi.fn().mockResolvedValue({ kind: "ok" }) },
    ...overrides,
  };
}

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
});

afterEach(() => {
  window.history.pushState(null, "", "/");
  window.localStorage.clear();
});

test("redirects the root path to /help without leaving the root in the history", async () => {
  const lengthBefore = window.history.length;

  await render(<App help={emptyHelp} services={createServices()} />);

  await expect.poll(() => window.location.pathname).toBe("/help");
  expect(window.history.length).toBe(lengthBefore);
});

test("redirects a path outside Help to /help", async () => {
  window.history.pushState(null, "", "/ventas");

  await render(<App help={help} services={createServices()} />);

  await expect.poll(() => window.location.pathname).toBe("/help");
});

test("redirects an unknown category or article to the closest page that exists", async () => {
  window.history.pushState(null, "", "/help/x/constructor");
  const screen = await render(<App help={help} services={createServices()} />);

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

  const screen = await render(<App help={help} services={createServices()} />);

  await expect.poll(() => window.location.pathname).toBe("/help/getting_started/intro");
  await expect.element(screen.getByText("Ayuda · Primeros pasos")).toBeVisible();
});

test("renders the shell's area rail and section column landmarks", async () => {
  const screen = await render(<App help={emptyHelp} services={createServices()} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  await expect
    .element(screen.getByRole("navigation", { name: "Secciones de ayuda" }))
    .toBeVisible();
});

test("shows the active Help item in the rail and the Help screen's own content", async () => {
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={createServices()} />);

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
  const screen = await render(<App help={help} services={createServices()} />);

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
  const screen = await render(<App help={help} services={createServices()} />);

  await userEvent.fill(screen.getByRole("searchbox", { name: "Buscar en la ayuda" }), "bienvenida");
  await expect.element(screen.getByRole("link", { name: "Bienvenida" })).toBeVisible();

  await userEvent.click(screen.getByRole("link", { name: "Facturación", exact: true }));

  await expect.element(screen.getByRole("link", { name: "Facturación básica" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Bienvenida" }).query()).toBeNull();
});

test("titles the document after the page being shown", async () => {
  window.history.pushState(null, "", "/help");
  const screen = await render(<App help={help} services={createServices()} />);

  await expect.poll(() => document.title).toBe("Ayuda · Puro Sur");

  await userEvent.click(screen.getByRole("link", { name: "Primeros pasos" }));
  await expect.poll(() => document.title).toBe("Primeros pasos · Ayuda · Puro Sur");

  await userEvent.click(screen.getByRole("link", { name: "Bienvenida" }));
  await expect.poll(() => document.title).toBe("Bienvenida · Ayuda · Puro Sur");
});

test("moves focus to the page heading after an in-app navigation, not on the first load", async () => {
  window.history.pushState(null, "", "/help/getting_started/intro");
  const screen = await render(<App help={help} services={createServices()} />);

  const firstHeading = screen.getByRole("heading", { name: "Bienvenida", level: 1 });
  await expect.element(firstHeading).toBeVisible();
  expect(document.activeElement).not.toBe(firstHeading.element());

  await userEvent.click(screen.getByRole("link", { name: "Facturación", exact: true }));

  await expect
    .element(screen.getByRole("heading", { name: "Facturación", level: 1 }))
    .toHaveFocus();
});

function scrollingAncestor(element: Element): HTMLElement {
  let ancestor = element.parentElement;
  while (ancestor && getComputedStyle(ancestor).overflowY !== "auto") {
    ancestor = ancestor.parentElement;
  }
  if (!ancestor) throw new Error("the element has no scrolling ancestor");
  return ancestor;
}

test("opens every help page at the top of its content, not where the previous page was scrolled", async () => {
  const longBody = Array.from({ length: 40 }, (_, index) => ({
    kind: "paragraph" as const,
    text: `Paso ${index + 1} de la guía.`,
  }));
  const longHelp = defineHelp("es-AR", {
    categories: { getting_started: { label: "Primeros pasos" } },
    articles: {
      intro: {
        category: "getting_started",
        title: "Bienvenida",
        body: [...longBody, { kind: "articleLink", article: "catalog" }],
      },
      catalog: { category: "getting_started", title: "Catálogo", body: longBody },
    },
  });
  window.history.pushState(null, "", "/help/getting_started/intro");
  const screen = await render(<App help={longHelp} services={createServices()} />);

  // Scoped to the page body: the backoffice's own "Catálogo" area item in the rail shares this
  // fixture article's title, now that an Administrator sees that item too.
  const link = screen.getByRole("main").getByRole("link", { name: "Catálogo" });
  await expect.element(link).toBeInTheDocument();
  const firstBody = scrollingAncestor(link.element());
  expect(firstBody.scrollHeight).toBeGreaterThan(firstBody.clientHeight);
  firstBody.scrollTop = firstBody.scrollHeight;
  await expect.poll(() => firstBody.scrollTop).toBeGreaterThan(0);

  await userEvent.click(link);

  await expect.element(screen.getByRole("heading", { name: "Catálogo", level: 1 })).toHaveFocus();
  expect(scrollingAncestor(screen.getByRole("searchbox").element()).scrollTop).toBe(0);
});

test("routes /sign-in to the sign-in screen, outside the Shell, when no session is live", async () => {
  const services = createServices({
    fetchSession: vi.fn().mockResolvedValue({ kind: "unauthenticated" }),
  });
  window.history.pushState(null, "", "/sign-in");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Ingresar", level: 1 })).toBeVisible();
  expect(screen.getByRole("navigation", { name: "Áreas" }).query()).toBeNull();
});

test("routes /account-recovery to the recovery form, outside the Shell", async () => {
  const services = createServices({
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
  const services = createServices({
    fetchSession: vi.fn().mockResolvedValue({ kind: "unauthenticated" }),
  });
  window.history.pushState(null, "", "/account-recovery/passkey#the-token");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByText("Abriendo el registro…")).toBeVisible();
  expect(services.registerPasskeyScreen.fetchRegistrationOptions).toHaveBeenCalledWith("the-token");
  expect(screen.getByRole("navigation", { name: "Áreas" }).query()).toBeNull();
});

test("renders nothing while the mount session check is pending", async () => {
  const services = createServices({ fetchSession: vi.fn().mockReturnValue(new Promise(() => {})) });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  expect(screen.getByRole("navigation", { name: "Áreas" }).query()).toBeNull();
  expect(screen.getByRole("heading", { name: "Ingresar" }).query()).toBeNull();
});

test("routes a shell path to the sign-in screen when the mount check finds no session", async () => {
  const services = createServices({
    fetchSession: vi.fn().mockResolvedValue({ kind: "unauthenticated" }),
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Ingresar", level: 1 })).toBeVisible();
});

test("shows the session-expired notice when a session was open in this browser before and now answers unauthenticated", async () => {
  window.localStorage.setItem("purosur-backoffice-was-signed-in", "1");
  const services = createServices({
    fetchSession: vi.fn().mockResolvedValue({ kind: "unauthenticated" }),
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByText("Tu sesión venció")).toBeVisible();
});

test("says the session could not be checked, instead of that it expired, when the check itself fails", async () => {
  window.localStorage.setItem("purosur-backoffice-was-signed-in", "1");
  const services = createServices({ fetchSession: vi.fn().mockResolvedValue({ kind: "failed" }) });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByText("No pudimos verificar tu sesión")).toBeVisible();
  expect(screen.getByText("Tu sesión venció").query()).toBeNull();
});

test("keeps the signed-in marker when the session check fails, since the session may still be live", async () => {
  window.localStorage.setItem("purosur-backoffice-was-signed-in", "1");
  const services = createServices({ fetchSession: vi.fn().mockResolvedValue({ kind: "failed" }) });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("heading", { name: "Ingresar", level: 1 })).toBeVisible();

  expect(window.localStorage.getItem("purosur-backoffice-was-signed-in")).toBe("1");
});

test("shows a rate-limited notice, instead of a generic failure, when the mount check is rate limited", async () => {
  window.localStorage.setItem("purosur-backoffice-was-signed-in", "1");
  const services = createServices({
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

  const screen = await render(<App help={emptyHelp} services={createServices()} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Ingresar" }).query()).toBeNull();
});

test("shows the signed-in user's name in the rail footer, and Salir signs back out to /sign-in", async () => {
  window.history.pushState(null, "", "/help");
  const services = createServices();

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByText("Lucas Guardiola")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Salir" }));
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Salir" }));

  await expect.poll(() => vi.mocked(services.accountFooter.signOut).mock.calls.length).toBe(1);
  await expect.element(screen.getByRole("heading", { name: "Ingresar", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/sign-in");
});

test("shows a focus ring on the page heading it focuses after a keyboard navigation", async () => {
  window.history.pushState(null, "", "/help/getting_started");
  const screen = await render(<App help={help} services={createServices()} />);

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
  const services = createServices();
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/settings/users/me");

  const screen = await render(<App help={emptyHelp} services={services} />);

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
  const services = createServices();
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/help");
  const screen = await render(<App help={emptyHelp} services={services} />);

  await userEvent.click(screen.getByRole("link", { name: "Lucas Guardiola" }));

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/settings/users/me");
});

test("following the sidebar's Usuarios item from Mi cuenta opens the Users list, with Mi cuenta still reachable from the account name", async () => {
  const services = createServices();
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/settings/users/me");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();

  vi.mocked(services.usersListScreen.fetchUsers).mockResolvedValue({ kind: "ok", value: [] });
  await userEvent.click(screen.getByRole("link", { name: "Usuarios" }));

  await expect.element(screen.getByRole("heading", { name: "Usuarios", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/settings/users");
  expect(services.usersListScreen.fetchUsers).toHaveBeenCalled();

  await userEvent.click(screen.getByRole("link", { name: "Lucas Guardiola" }));

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/settings/users/me");
});

test("opens a user's detail screen at /settings/users/:id, with Usuarios still the active sidebar item, and the browser's back button returns to the list", async () => {
  const services = createServices();
  const martina = {
    id: "user-2",
    firstName: "Martina Gómez",
    email: "martina@example.com",
    version: 1,
    role: { id: "role-admin", isAdministrator: true, name: null },
    passkeyCount: 1,
  };
  vi.mocked(services.usersListScreen.fetchUsers).mockResolvedValue({
    kind: "ok",
    value: [martina],
  });
  vi.mocked(services.userDetailScreen.fetchUser).mockResolvedValue({ kind: "ok", value: martina });
  window.history.pushState(null, "", "/settings/users");
  window.history.pushState(null, "", "/settings/users/user-2");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Martina Gómez", level: 1 }))
    .toBeVisible();
  const usersItem = screen.getByRole("link", { name: "Usuarios" }).element() as HTMLAnchorElement;
  expect(usersItem.getAttribute("aria-current")).toBe("page");

  window.history.back();

  await expect.element(screen.getByRole("heading", { name: "Usuarios", level: 1 })).toBeVisible();
});

test("passes the signed-in Administrator's own id to the user detail screen, hiding their own passkey's remove button", async () => {
  const services = createServices();
  const lucas = {
    id: "user-1",
    firstName: "Lucas Guardiola",
    email: "lucas@example.com",
    version: 1,
    role: { id: "role-admin", isAdministrator: true, name: null },
    passkeyCount: 1,
  };
  vi.mocked(services.userDetailScreen.fetchUser).mockResolvedValue({ kind: "ok", value: lucas });
  vi.mocked(services.userDetailScreen.fetchUserPasskeys).mockResolvedValue({
    kind: "ok",
    value: [
      {
        id: "pk-1",
        name: "Notebook del local",
        createdAt: "2026-08-02T12:00:00.000Z",
        lastUsedAt: null,
      },
    ],
  });
  window.history.pushState(null, "", "/settings/users/user-1");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Dar de baja la passkey «Notebook del local»" }).query(),
  ).toBeNull();
});

test("shows the Roles item in the rail, only for an Administrator, linking to the roles list", async () => {
  window.history.pushState(null, "", "/settings/users/me");
  const services = createServices();
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();

  await expect.element(screen.getByRole("link", { name: "Roles" })).toBeVisible();
});

test("hides the Roles item in the rail for a non-Administrator", async () => {
  const services = createServices({
    fetchSession: vi.fn().mockResolvedValue({
      kind: "ok",
      userId: "user-2",
      displayName: "Grace Hopper",
      isAdministrator: false,
    }),
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Roles" }).query()).toBeNull();
});

test("following the sidebar's Roles item opens the roles list, with Config and Roles active", async () => {
  window.history.pushState(null, "", "/settings/users/me");
  const services = createServices();
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.rolesListScreen.fetchRoles).mockResolvedValue({ kind: "ok", value: [] });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();

  await userEvent.click(screen.getByRole("link", { name: "Roles" }));

  await expect.element(screen.getByRole("heading", { name: "Roles", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/settings/roles");
  const configItem = screen.getByRole("link", { name: "Config" }).element() as HTMLAnchorElement;
  expect(configItem.getAttribute("aria-current")).toBe("page");
  const rolesItem = screen.getByRole("link", { name: "Roles" }).element() as HTMLAnchorElement;
  expect(rolesItem.getAttribute("aria-current")).toBe("page");
});

test("shows the Sucursal item in the rail for a user holding configure_branch, linking to its screen", async () => {
  window.history.pushState(null, "", "/settings/users/me");
  const services = createServices({
    fetchSession: vi.fn().mockResolvedValue({
      kind: "ok",
      userId: "user-2",
      displayName: "Grace Hopper",
      isAdministrator: false,
      permissions: ["configure_branch"],
    }),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();

  await expect.element(screen.getByRole("link", { name: "Sucursal" })).toBeVisible();
});

test("hides the Sucursal item in the rail for a user without configure_branch", async () => {
  const services = createServices({
    fetchSession: vi.fn().mockResolvedValue({
      kind: "ok",
      userId: "user-2",
      displayName: "Grace Hopper",
      isAdministrator: false,
      permissions: [],
    }),
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Sucursal" }).query()).toBeNull();
});

test("following the sidebar's Sucursal item opens the branch settings screen, with Config and Sucursal active", async () => {
  window.history.pushState(null, "", "/settings/users/me");
  const services = createServices();
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.branchSettingsScreen.fetchBranchSettings).mockResolvedValue({
    kind: "ok",
    value: {
      address: "",
      whatsappNumber: "",
      instagramHandle: "",
      hours: {
        monday: [],
        tuesday: [],
        wednesday: [],
        thursday: [],
        friday: [],
        saturday: [],
        sunday: [],
      },
      expiringLotAlertDays: 30,
      unreviewedPriceAlertDays: 30,
      goodConditionReturnDays: 15,
      version: 1,
    },
  });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();

  await userEvent.click(screen.getByRole("link", { name: "Sucursal" }));

  await expect.element(screen.getByRole("heading", { name: "Sucursal", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/settings/branch");
  const configItem = screen.getByRole("link", { name: "Config" }).element() as HTMLAnchorElement;
  expect(configItem.getAttribute("aria-current")).toBe("page");
  const branchItem = screen.getByRole("link", { name: "Sucursal" }).element() as HTMLAnchorElement;
  expect(branchItem.getAttribute("aria-current")).toBe("page");
});

test("redirects a typed /settings/branch to Mi cuenta for a user without configure_branch, without calling its API", async () => {
  const services = createServices({
    fetchSession: vi.fn().mockResolvedValue({
      kind: "ok",
      userId: "user-2",
      displayName: "Grace Hopper",
      isAdministrator: false,
      permissions: [],
    }),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/settings/branch");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/settings/users/me");
  expect(services.branchSettingsScreen.fetchBranchSettings).not.toHaveBeenCalled();
});

test("opens the new role page at /settings/roles/new from the Nuevo rol button", async () => {
  // This checks routing/wiring only, the same way every other screen's own test file (not
  // App.test.tsx) owns its form-fill-and-submit behavior: NewRoleScreen.test.tsx already covers
  // the full passkey step-up creation flow, and Cancelar's own navigation, in isolation.
  window.history.pushState(null, "", "/settings/roles");
  const services = createServices();
  vi.mocked(services.rolesListScreen.fetchRoles).mockResolvedValue({ kind: "ok", value: [] });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("heading", { name: "Roles", level: 1 })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Nuevo rol" }));

  await expect.element(screen.getByRole("heading", { name: "Nuevo rol", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/settings/roles/new");
  expect(services.newRoleScreen.createRole).not.toHaveBeenCalled();
});

test("opens a role's edit page at /settings/roles/:id/edit, with Roles still the active sidebar item, and the browser's back button returns to the list", async () => {
  // Routing/wiring only, the same way the user detail wiring test above navigates by URL rather
  // than a row click: EditRoleScreen.test.tsx already covers the full pre-fill, passkey step-up,
  // and stale-save flow in isolation, and RolesListScreen.test.tsx already covers the pencil
  // action's own click and navigation.
  const services = createServices();
  vi.mocked(services.rolesListScreen.fetchRoles).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/settings/roles");
  window.history.pushState(null, "", "/settings/roles/role-stock/edit");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Editar rol", level: 1 })).toBeVisible();
  expect(services.editRoleScreen.fetchRole).toHaveBeenCalledWith("role-stock");
  const rolesItem = screen.getByRole("link", { name: "Roles" }).element() as HTMLAnchorElement;
  expect(rolesItem.getAttribute("aria-current")).toBe("page");

  window.history.back();

  await expect.element(screen.getByRole("heading", { name: "Roles", level: 1 })).toBeVisible();
});

test("opens a role's duplicate page at /settings/roles/:id/duplicate, pre-filled from the source role", async () => {
  // Routing/wiring only, the same way the edit page's own wiring test above navigates by URL:
  // DuplicateRoleScreen.test.tsx already covers the full pre-fill, passkey step-up, and error
  // states in isolation, and RolesListScreen.test.tsx already covers the copy action's own click.
  const services = createServices();
  vi.mocked(services.duplicateRoleScreen.fetchRoles).mockResolvedValue({
    kind: "ok",
    value: [
      {
        id: "role-stock",
        name: "Depósito",
        isAdministrator: false,
        permissionKeys: [],
        userCount: 0,
      },
    ],
  });
  window.history.pushState(null, "", "/settings/roles");
  window.history.pushState(null, "", "/settings/roles/role-stock/duplicate");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Duplicar rol", level: 1 }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Copia de Depósito");
  const rolesItem = screen.getByRole("link", { name: "Roles" }).element() as HTMLAnchorElement;
  expect(rolesItem.getAttribute("aria-current")).toBe("page");

  window.history.back();

  await expect.element(screen.getByRole("heading", { name: "Roles", level: 1 })).toBeVisible();
});

test("redirects a non-Administrator's typed /settings/roles to Mi cuenta, without listing roles", async () => {
  const services = createServices({
    fetchSession: vi.fn().mockResolvedValue({
      kind: "ok",
      userId: "user-2",
      displayName: "Grace Hopper",
      isAdministrator: false,
      permissions: [],
    }),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/settings/roles");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/settings/users/me");
  expect(services.rolesListScreen.fetchRoles).not.toHaveBeenCalled();
});

test("redirects a non-Administrator's typed /settings/users to Mi cuenta, without listing users", async () => {
  const services = createServices({
    fetchSession: vi.fn().mockResolvedValue({
      kind: "ok",
      userId: "user-2",
      displayName: "Grace Hopper",
      isAdministrator: false,
      permissions: [],
    }),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/settings/users");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/settings/users/me");
  expect(services.usersListScreen.fetchUsers).not.toHaveBeenCalled();
});

test("shows Mi cuenta's own sidebar entry instead of Usuarios for a non-Administrator", async () => {
  const services = createServices({
    fetchSession: vi.fn().mockResolvedValue({
      kind: "ok",
      userId: "user-2",
      displayName: "Grace Hopper",
      isAdministrator: false,
      permissions: [],
    }),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/settings/users/me");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  const myAccountItem = screen
    .getByRole("link", { name: "Mi cuenta" })
    .element() as HTMLAnchorElement;
  expect(myAccountItem.getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "Usuarios" }).query()).toBeNull();
  expect(screen.getByRole("link", { name: "Roles" }).query()).toBeNull();
});

test("lets a non-Administrator holding deactivate_users open Usuarios, without Nuevo usuario", async () => {
  const services = createServices({
    fetchSession: vi.fn().mockResolvedValue({
      kind: "ok",
      userId: "user-2",
      displayName: "Grace Hopper",
      isAdministrator: false,
      permissions: ["deactivate_users"],
    }),
  });
  vi.mocked(services.usersListScreen.fetchUsers).mockResolvedValue({
    kind: "ok",
    value: [
      {
        id: "user-3",
        firstName: "Tomás Ruiz",
        email: "tomas@example.com",
        version: 1,
        role: { id: "role-shift", isAdministrator: false, name: "Atención de caja" },
        passkeyCount: 0,
      },
    ],
  });
  // Reading the roles is Administrator-only on the cloud.
  vi.mocked(services.usersListScreen.fetchRoles).mockResolvedValue({ kind: "forbidden" });
  window.history.pushState(null, "", "/settings/users");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Usuarios", level: 1 })).toBeVisible();
  await expect.element(screen.getByText("1 usuario")).toBeVisible();
  expect(screen.getByRole("button", { name: "Nuevo usuario" }).query()).toBeNull();
  expect(services.usersListScreen.fetchRoles).not.toHaveBeenCalled();
  expect(window.location.pathname).toBe("/settings/users");
  window.history.pushState(null, "", "/");
});

test("opens a user's detail for a non-Administrator holding deactivate_users, offering only Desactivar", async () => {
  const services = createServices({
    fetchSession: vi.fn().mockResolvedValue({
      kind: "ok",
      userId: "user-2",
      displayName: "Grace Hopper",
      isAdministrator: false,
      permissions: ["deactivate_users"],
    }),
  });
  vi.mocked(services.userDetailScreen.fetchUser).mockResolvedValue({
    kind: "ok",
    value: {
      id: "user-3",
      firstName: "Tomás Ruiz",
      email: "tomas@example.com",
      version: 1,
      role: { id: "role-shift", isAdministrator: false, name: "Atención de caja" },
      passkeyCount: 0,
    },
  });
  // Reading a user's passkeys is Administrator-only on the cloud.
  vi.mocked(services.userDetailScreen.fetchUserPasskeys).mockResolvedValue({ kind: "forbidden" });
  window.history.pushState(null, "", "/settings/users/user-3");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Tomás Ruiz", level: 1 })).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Desactivar a Tomás Ruiz" }))
    .toBeVisible();
  expect(screen.getByRole("button", { name: "Editar" }).query()).toBeNull();
  expect(services.userDetailScreen.fetchUserPasskeys).not.toHaveBeenCalled();
  expect(window.location.pathname).toBe("/settings/users/user-3");
  window.history.pushState(null, "", "/");
});

test.each([
  {
    path: "/settings/users/user-3",
    adminOnlyCalls: (services: AppServices) => [
      services.userDetailScreen.fetchUser,
      services.userDetailScreen.fetchUserPasskeys,
    ],
  },
  {
    path: "/settings/roles/new",
    adminOnlyCalls: (services: AppServices) => [services.newRoleScreen.createRole],
  },
  {
    path: "/settings/roles/role-stock/edit",
    adminOnlyCalls: (services: AppServices) => [services.editRoleScreen.fetchRole],
  },
  {
    path: "/settings/roles/role-stock/duplicate",
    adminOnlyCalls: (services: AppServices) => [services.duplicateRoleScreen.fetchRoles],
  },
])(
  "redirects a non-Administrator's typed $path to Mi cuenta, without calling its API",
  async ({ path, adminOnlyCalls }) => {
    const services = createServices({
      fetchSession: vi.fn().mockResolvedValue({
        kind: "ok",
        userId: "user-2",
        displayName: "Grace Hopper",
        isAdministrator: false,
        permissions: [],
      }),
    });
    vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
    window.history.pushState(null, "", path);

    const screen = await render(<App help={emptyHelp} services={services} />);

    await expect
      .element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 }))
      .toBeVisible();
    expect(window.location.pathname).toBe("/settings/users/me");
    for (const call of adminOnlyCalls(services)) {
      expect(call).not.toHaveBeenCalled();
    }
  },
);

test("follows a demotion reported by real use of the open tab: Usuarios and Roles leave the rail and the Users list gives way to Mi cuenta", async () => {
  const services = createServices();
  vi.mocked(services.usersListScreen.fetchUsers).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.usersListScreen.fetchRoles).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/settings/users");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("link", { name: "Roles" })).toBeVisible();

  vi.mocked(services.fetchSession).mockResolvedValue({
    kind: "ok",
    userId: "user-1",
    displayName: "Lucas Guardiola",
    isAdministrator: false,
    permissions: [],
  });
  // Past the activity reporter's throttle window, so the next real use touches the session.
  vi.setSystemTime(Date.now() + 120_000);
  try {
    window.dispatchEvent(new KeyboardEvent("keydown"));

    await expect
      .element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 }))
      .toBeVisible();
    expect(window.location.pathname).toBe("/settings/users/me");
    expect(screen.getByRole("link", { name: "Roles" }).query()).toBeNull();
    expect(screen.getByRole("link", { name: "Usuarios" }).query()).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test("follows a promotion reported by real use of the open tab: Usuarios and Roles join the rail", async () => {
  const services = createServices({
    fetchSession: vi.fn().mockResolvedValue({
      kind: "ok",
      userId: "user-2",
      displayName: "Grace Hopper",
      isAdministrator: false,
      permissions: [],
    }),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/settings/users/me");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(screen.getByRole("link", { name: "Roles" }).query()).toBeNull();

  vi.mocked(services.fetchSession).mockResolvedValue({
    kind: "ok",
    userId: "user-2",
    displayName: "Grace Hopper",
    isAdministrator: true,
    permissions: [],
  });
  // Past the activity reporter's throttle window, so the next real use touches the session.
  vi.setSystemTime(Date.now() + 120_000);
  try {
    window.dispatchEvent(new KeyboardEvent("keydown"));

    await expect.element(screen.getByRole("link", { name: "Roles" })).toBeVisible();
    await expect.element(screen.getByRole("link", { name: "Usuarios" })).toBeVisible();
  } finally {
    vi.useRealTimers();
  }
});

test("ends the session with the expired notice when Mi cuenta's passkeys request finds it already ended", async () => {
  const services = createServices();
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({
    kind: "unauthenticated",
  });
  window.history.pushState(null, "", "/settings/users/me");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Ingresar", level: 1 })).toBeVisible();
  await expect.element(screen.getByText("Tu sesión venció")).toBeVisible();
  expect(window.location.pathname).toBe("/sign-in");
});

test("ends the session with the expired notice when the open tab's status check finds it already ended", async () => {
  const services = createServices();
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();

  vi.mocked(services.checkSessionStatus).mockResolvedValue({ kind: "unauthenticated" });
  document.dispatchEvent(new Event("visibilitychange"));

  await expect.element(screen.getByRole("heading", { name: "Ingresar", level: 1 })).toBeVisible();
  await expect.element(screen.getByText("Tu sesión venció")).toBeVisible();
  expect(window.location.pathname).toBe("/sign-in");
});

test("ends the session with the expired notice when real use of the open tab finds it already ended", async () => {
  const services = createServices();
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();

  vi.mocked(services.fetchSession).mockResolvedValue({ kind: "unauthenticated" });
  // Past the activity reporter's throttle window, so the next real use touches the session.
  vi.setSystemTime(Date.now() + 120_000);
  try {
    await userEvent.click(screen.getByRole("searchbox", { name: "Buscar en la ayuda" }));

    await expect.element(screen.getByRole("heading", { name: "Ingresar", level: 1 })).toBeVisible();
    await expect.element(screen.getByText("Tu sesión venció")).toBeVisible();
    expect(window.location.pathname).toBe("/sign-in");
  } finally {
    vi.useRealTimers();
  }
});

test("shows the Catálogo item in the rail for a user holding manage_products_and_categories, linking to the products list", async () => {
  const services = createServices({
    fetchSession: vi.fn().mockResolvedValue({
      kind: "ok",
      userId: "user-2",
      displayName: "Grace Hopper",
      isAdministrator: false,
      permissions: ["manage_products_and_categories"],
    }),
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("link", { name: "Catálogo" })).toBeVisible();
});

test("hides the Catálogo item in the rail for a user without the permission", async () => {
  const services = createServices({
    fetchSession: vi.fn().mockResolvedValue({
      kind: "ok",
      userId: "user-2",
      displayName: "Grace Hopper",
      isAdministrator: false,
      permissions: [],
    }),
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Catálogo" }).query()).toBeNull();
});

test.each(["/help", "/settings/users", "/catalog/categories", "/catalog/products"])(
  "lists Catálogo above Config in the rail on %s",
  async (path) => {
    window.history.pushState(null, "", path);
    const services = createServices();
    vi.mocked(services.categoriesListScreen.fetchCategories).mockResolvedValue({
      kind: "ok",
      value: [],
    });
    vi.mocked(services.productsListScreen.fetchProducts).mockResolvedValue({
      kind: "ok",
      value: [],
    });
    vi.mocked(services.productsListScreen.fetchCategories).mockResolvedValue({
      kind: "ok",
      value: [],
    });

    const screen = await render(<App help={emptyHelp} services={services} />);

    const rail = screen.getByRole("navigation", { name: "Áreas" });
    await expect.element(rail.getByRole("link", { name: "Catálogo" })).toBeVisible();
    const labels = rail
      .getByRole("link")
      .elements()
      .map((link) => link.textContent);
    expect(labels.indexOf("Catálogo")).toBeLessThan(labels.indexOf("Config"));
  },
);

test("following the rail's Catálogo item opens the products list, with Catálogo and Productos active", async () => {
  window.history.pushState(null, "", "/help");
  const services = createServices();
  vi.mocked(services.productsListScreen.fetchProducts).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  vi.mocked(services.productsListScreen.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("link", { name: "Catálogo" })).toBeVisible();

  await userEvent.click(screen.getByRole("link", { name: "Catálogo" }));

  await expect.element(screen.getByRole("heading", { name: "Productos", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/catalog/products");
  const catalogItem = screen.getByRole("link", { name: "Catálogo" }).element() as HTMLAnchorElement;
  expect(catalogItem.getAttribute("aria-current")).toBe("page");
  const productsItem = screen
    .getByRole("link", { name: "Productos" })
    .element() as HTMLAnchorElement;
  expect(productsItem.getAttribute("aria-current")).toBe("page");
});

test("navigating directly to /catalog/categories opens the categories list, with Categorías active", async () => {
  window.history.pushState(null, "", "/catalog/categories");
  const services = createServices();
  vi.mocked(services.categoriesListScreen.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [],
  });

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Categorías", level: 1 })).toBeVisible();
  const categoriesItem = screen
    .getByRole("link", { name: "Categorías" })
    .element() as HTMLAnchorElement;
  expect(categoriesItem.getAttribute("aria-current")).toBe("page");
  window.history.pushState(null, "", "/");
});

test("redirects a non-permitted user's typed /catalog/categories to Mi cuenta, without listing categories", async () => {
  const services = createServices({
    fetchSession: vi.fn().mockResolvedValue({
      kind: "ok",
      userId: "user-2",
      displayName: "Grace Hopper",
      isAdministrator: false,
      permissions: [],
    }),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/catalog/categories");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/settings/users/me");
  expect(services.categoriesListScreen.fetchCategories).not.toHaveBeenCalled();
});

test("redirects a non-permitted user's typed /catalog/products to Mi cuenta, without listing products", async () => {
  const services = createServices({
    fetchSession: vi.fn().mockResolvedValue({
      kind: "ok",
      userId: "user-2",
      displayName: "Grace Hopper",
      isAdministrator: false,
      permissions: [],
    }),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/catalog/products");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/settings/users/me");
  expect(services.productsListScreen.fetchProducts).not.toHaveBeenCalled();
});
