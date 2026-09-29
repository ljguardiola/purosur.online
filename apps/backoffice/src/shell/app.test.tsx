import { defineHelp } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { openSession } from "../access/test-support/open-session";
import { almonds, honey } from "../catalog/test-support/products";
import { App, type AppServices } from "./app";
import { createAppServices } from "./test-support/app-services";

const PAST_ACTIVITY_THROTTLE_WINDOW_MS = 120_000;

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

  await render(<App help={emptyHelp} services={createAppServices()} />);

  await expect.poll(() => window.location.pathname).toBe("/help");
  expect(window.history.length).toBe(lengthBefore);
});

test.each(["/ventas", "/helps", "/help/getting_started/intro/extra", "/catalog", "/settings"])(
  "redirects %s, which names no screen, to /help",
  async (path) => {
    window.history.pushState(null, "", path);

    await render(<App help={help} services={createAppServices()} />);

    await expect.poll(() => window.location.pathname).toBe("/help");
  },
);

test("redirects an unknown category or article to the closest page that exists", async () => {
  window.history.pushState(null, "", "/help/x/constructor");
  const screen = await render(<App help={help} services={createAppServices()} />);

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

  const screen = await render(<App help={help} services={createAppServices()} />);

  await expect.poll(() => window.location.pathname).toBe("/help/getting_started/intro");
  await expect.element(screen.getByText("Ayuda · Primeros pasos")).toBeVisible();
});

test("a rail item is a real link to its screen, and a plain click opens that screen in place", async () => {
  const services = createAppServices();
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/help");
  const screen = await render(<App help={emptyHelp} services={services} />);
  const configItem = screen.getByRole("link", { name: "Config" });
  await expect.element(configItem).toBeVisible();

  expect(configItem.element().getAttribute("href")).toBe("/settings/users/me");
  await userEvent.click(configItem);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/settings/users/me");

  window.history.back();

  await expect.poll(() => window.location.pathname).toBe("/help");
});

test("a rail item leaves a modifier click to the browser", async () => {
  window.history.pushState(null, "", "/help");
  const screen = await render(<App help={emptyHelp} services={createAppServices()} />);
  const configItem = screen.getByRole("link", { name: "Config" });
  await expect.element(configItem).toBeVisible();

  const cancelRealNavigation = (event: Event) => event.preventDefault();
  window.addEventListener("click", cancelRealNavigation);
  try {
    await userEvent.click(configItem, { modifiers: ["Meta"] });
  } finally {
    window.removeEventListener("click", cancelRealNavigation);
  }

  expect(window.location.pathname).toBe("/help");
  expect(screen.getByRole("heading", { name: "Mi cuenta" }).query()).toBeNull();
});

test("renders the shell's area rail and section column landmarks", async () => {
  const screen = await render(<App help={emptyHelp} services={createAppServices()} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  await expect
    .element(screen.getByRole("navigation", { name: "Secciones de ayuda" }))
    .toBeVisible();
});

test("shows the active Help item in the rail, leaving other areas in the rail unhighlighted, and the Help screen's own content", async () => {
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={createAppServices()} />);

  const helpItemLocator = screen.getByRole("link", { name: "Ayuda" });
  await expect.element(helpItemLocator).toBeVisible();
  const helpItem = helpItemLocator.element() as HTMLAnchorElement;
  expect(helpItem.getAttribute("aria-current")).toBe("page");

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
  const screen = await render(<App help={help} services={createAppServices()} />);

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
  const screen = await render(<App help={help} services={createAppServices()} />);

  await userEvent.fill(screen.getByRole("searchbox", { name: "Buscar en la ayuda" }), "bienvenida");
  await expect.element(screen.getByRole("link", { name: "Bienvenida" })).toBeVisible();

  await userEvent.click(screen.getByRole("link", { name: "Facturación", exact: true }));

  await expect.element(screen.getByRole("link", { name: "Facturación básica" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Bienvenida" }).query()).toBeNull();
});

test("titles the document after the page being shown", async () => {
  window.history.pushState(null, "", "/help");
  const screen = await render(<App help={help} services={createAppServices()} />);

  await expect.poll(() => document.title).toBe("Ayuda · Puro Sur");

  await userEvent.click(screen.getByRole("link", { name: "Primeros pasos" }));
  await expect.poll(() => document.title).toBe("Primeros pasos · Ayuda · Puro Sur");

  await userEvent.click(screen.getByRole("link", { name: "Bienvenida" }));
  await expect.poll(() => document.title).toBe("Bienvenida · Ayuda · Puro Sur");
});

test("moves focus to the page heading after an in-app navigation, not on the first load", async () => {
  window.history.pushState(null, "", "/help/getting_started/intro");
  const screen = await render(<App help={help} services={createAppServices()} />);

  const firstHeading = screen.getByRole("heading", { name: "Bienvenida", level: 1 });
  await expect.element(firstHeading).toBeVisible();
  expect(document.activeElement).not.toBe(firstHeading.element());

  await userEvent.click(screen.getByRole("link", { name: "Facturación", exact: true }));

  await expect
    .element(screen.getByRole("heading", { name: "Facturación", level: 1 }))
    .toHaveFocus();
});

async function pressEnterOn(link: HTMLElement) {
  link.focus();
  await userEvent.keyboard("{Enter}");
}

test("moves focus to the new screen's title, with a focus ring, after choosing a section with the keyboard, not on the first load", async () => {
  window.history.pushState(null, "", "/settings/users/me");
  const services = createAppServices();
  vi.mocked(services.rolesListScreen.fetchRoles).mockResolvedValue({ kind: "ok", value: [] });
  const screen = await render(<App help={emptyHelp} services={services} />);
  const firstTitle = screen.getByRole("heading", { name: "Mi cuenta", level: 1 });
  await expect.element(firstTitle).toBeVisible();
  expect(document.activeElement).not.toBe(firstTitle.element());

  await pressEnterOn(screen.getByRole("link", { name: "Roles" }).element() as HTMLElement);

  const title = screen.getByRole("heading", { name: "Roles", level: 1 });
  await expect.element(title).toHaveFocus();
  const style = getComputedStyle(title.element());
  await expect.poll(() => style.outlineStyle).toBe("solid");
  expect(style.outlineWidth).toBe("3px");
});

test("moves focus to the new area's screen title after switching area from the rail with the keyboard", async () => {
  window.history.pushState(null, "", "/help");
  const screen = await render(<App help={emptyHelp} services={createAppServices()} />);
  await expect
    .element(screen.getByRole("heading", { name: "Todavía no hay contenido de ayuda", level: 1 }))
    .toBeVisible();

  await pressEnterOn(screen.getByRole("link", { name: "Config" }).element() as HTMLElement);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toHaveFocus();
});

test("moves focus to the new screen's title after following a link between the screens reached without a session", async () => {
  window.history.pushState(null, "", "/sign-in");
  const screen = await render(
    <App
      help={emptyHelp}
      services={createAppServices({
        fetchSession: vi.fn().mockResolvedValue({ kind: "unauthenticated" }),
      })}
    />,
  );
  await expect.element(screen.getByRole("heading", { name: "Ingresar", level: 1 })).toBeVisible();

  await pressEnterOn(
    screen.getByRole("link", { name: "Perdí mis passkeys" }).element() as HTMLElement,
  );

  await expect
    .element(screen.getByRole("heading", { name: "Recuperar el acceso", level: 1 }))
    .toHaveFocus();
});

test("moves focus to the first screen's title after signing in", async () => {
  window.history.pushState(null, "", "/sign-in");
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValueOnce({ kind: "unauthenticated" })
      .mockResolvedValue(openSession()),
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

  await userEvent.click(screen.getByRole("button", { name: "Ingresar con passkey" }));

  await expect
    .element(screen.getByRole("heading", { name: "Todavía no hay contenido de ayuda", level: 1 }))
    .toHaveFocus();
});

test("leaves focus where it is when only a list's filters change", async () => {
  const services = createAppServices();
  vi.mocked(services.productsListScreen.fetchProducts).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.productsListScreen.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  window.history.pushState(null, "", "/catalog/products");
  const screen = await render(<App help={emptyHelp} services={services} />);
  const searchBox = screen.getByPlaceholder("Buscar por nombre o código de barras");
  await expect.element(searchBox).toBeVisible();

  await userEvent.fill(searchBox, "miel");

  await expect.poll(() => new URLSearchParams(window.location.search).get("search")).toBe("miel");
  await expect.element(screen.getByRole("heading", { name: "Productos", level: 1 })).toBeVisible();
  await expect.element(searchBox).toHaveFocus();
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
  const screen = await render(<App help={longHelp} services={createAppServices()} />);

  // Scoped to main: the rail's own Catálogo area item shares this fixture article's title.
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

test("provides the backoffice field size at the root, so a screen never has to ask for it", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue({ kind: "unauthenticated" }),
  });
  window.history.pushState(null, "", "/account-recovery");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Recuperar el acceso", level: 1 }))
    .toBeVisible();

  const label = screen.getByText("Correo de tu cuenta").element() as HTMLElement;
  const input = screen.getByRole("textbox", { name: /^Correo de tu cuenta/ }).element();
  const box = input.parentElement as HTMLElement;

  expect(Math.round(Number.parseFloat(getComputedStyle(label).fontSize))).toBe(14);
  expect(box.getBoundingClientRect().height).toBeCloseTo(48, 0);
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

  await expect.element(screen.getByText("Lucas Guardiola")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Salir" }));
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Salir" }));

  await expect.poll(() => vi.mocked(services.accountFooter.signOut).mock.calls.length).toBe(1);
  await expect.element(screen.getByRole("heading", { name: "Ingresar", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/sign-in");
});

test("a list the previous person had open is read again from the loading placeholder after signing out and back in", async () => {
  await page.viewport(1280, 900);
  window.history.pushState(null, "", "/catalog/products");
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

test("shows a focus ring on the page heading it focuses after a keyboard navigation", async () => {
  window.history.pushState(null, "", "/help/getting_started");
  const screen = await render(<App help={help} services={createAppServices()} />);

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

test("routes /settings/users/me to Mi cuenta inside the Shell, with Config and Usuarios active and Ayuda not", async () => {
  const services = createAppServices();
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/settings/users/me");

  const screen = await render(<App help={emptyHelp} services={services} />);

  const configItem = screen.getByRole("link", { name: "Config" }).element() as HTMLAnchorElement;
  expect(configItem.getAttribute("aria-current")).toBe("page");
  const usersItem = screen.getByRole("link", { name: "Usuarios" }).element() as HTMLAnchorElement;
  expect(usersItem.getAttribute("aria-current")).toBe("page");
  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  await expect.poll(() => document.title).toBe("Mi cuenta · Puro Sur");

  const helpItemLocator = screen.getByRole("link", { name: "Ayuda" });
  await expect.element(helpItemLocator).toBeVisible();
  const helpItem = helpItemLocator.element() as HTMLAnchorElement;
  expect(helpItem.getAttribute("aria-current")).toBeNull();
});

test("following the account name link from Help shows Mi cuenta", async () => {
  const services = createAppServices();
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/help");
  const screen = await render(<App help={emptyHelp} services={services} />);

  await userEvent.click(screen.getByRole("link", { name: "Lucas Guardiola" }));

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/settings/users/me");
});

test("following the sidebar's Usuarios item from Mi cuenta opens the Users list, with Mi cuenta still reachable from the account name", async () => {
  const services = createAppServices();
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
  const services = createAppServices();
  const martina = {
    id: "user-2",
    firstName: "Martina Gómez",
    email: "martina@example.com",
    version: 1,
    role: { id: "role-admin", isAdministrator: true, name: null },
    passkeyCount: 1,
    isLastActiveAdministrator: false,
  };
  vi.mocked(services.usersListScreen.fetchUsers).mockResolvedValue({
    kind: "ok",
    value: [martina],
  });
  vi.mocked(services.userDetailScreen.fetchUser).mockResolvedValue({ kind: "ok", value: martina });
  vi.mocked(services.userDetailScreen.fetchRoles).mockResolvedValue({ kind: "ok", value: [] });
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
  const services = createAppServices();
  const lucas = {
    id: "user-1",
    firstName: "Lucas Guardiola",
    email: "lucas@example.com",
    version: 1,
    role: { id: "role-admin", isAdministrator: true, name: null },
    passkeyCount: 1,
    isLastActiveAdministrator: true,
  };
  vi.mocked(services.userDetailScreen.fetchUser).mockResolvedValue({ kind: "ok", value: lucas });
  vi.mocked(services.userDetailScreen.fetchRoles).mockResolvedValue({ kind: "ok", value: [] });
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
  const services = createAppServices();
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();

  await expect.element(screen.getByRole("link", { name: "Roles" })).toBeVisible();
});

test("hides the Roles item in the rail for a non-Administrator", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Roles" }).query()).toBeNull();
});

test("following the sidebar's Roles item opens the roles list, with Config and Roles active", async () => {
  window.history.pushState(null, "", "/settings/users/me");
  const services = createAppServices();
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

test("shows the Cajas registradoras item in the rail for a user holding enroll_register_devices, linking to its screen", async () => {
  window.history.pushState(null, "", "/settings/users/me");
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Hopper",
        isAdministrator: false,
        permissions: ["enroll_register_devices"],
      }),
    ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();

  await expect.element(screen.getByRole("link", { name: "Cajas registradoras" })).toBeVisible();
});

test("hides the Cajas registradoras item in the rail for a user without enroll_register_devices", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Cajas registradoras" }).query()).toBeNull();
});

test("following the sidebar's Cajas registradoras item opens the registers list, with Config and Cajas registradoras active", async () => {
  window.history.pushState(null, "", "/settings/users/me");
  const services = createAppServices();
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.registersListScreen.fetchRegisters).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();

  await userEvent.click(screen.getByRole("link", { name: "Cajas registradoras" }));

  await expect
    .element(screen.getByRole("heading", { name: "Cajas registradoras", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/settings/registers");
  const configItem = screen.getByRole("link", { name: "Config" }).element() as HTMLAnchorElement;
  expect(configItem.getAttribute("aria-current")).toBe("page");
  const registersItem = screen
    .getByRole("link", { name: "Cajas registradoras" })
    .element() as HTMLAnchorElement;
  expect(registersItem.getAttribute("aria-current")).toBe("page");
});

test("redirects a typed /settings/registers to Mi cuenta for a user without enroll_register_devices, without calling its API", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/settings/registers");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/settings/users/me");
  expect(services.registersListScreen.fetchRegisters).not.toHaveBeenCalled();
});

test("shows the Sucursal item in the rail for a user holding configure_branch, linking to its screen", async () => {
  window.history.pushState(null, "", "/settings/users/me");
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Hopper",
        isAdministrator: false,
        permissions: ["configure_branch"],
      }),
    ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();

  await expect.element(screen.getByRole("link", { name: "Sucursal" })).toBeVisible();
});

test("hides the Sucursal item in the rail for a user without configure_branch", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Sucursal" }).query()).toBeNull();
});

test("following the sidebar's Sucursal item opens the branch settings screen, with Config and Sucursal active", async () => {
  window.history.pushState(null, "", "/settings/users/me");
  const services = createAppServices();
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
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/settings/branch");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/settings/users/me");
  expect(services.branchSettingsScreen.fetchBranchSettings).not.toHaveBeenCalled();
});

test("opens the role editor modal, over the Roles list, from the Nuevo rol button, without submitting it", async () => {
  window.history.pushState(null, "", "/settings/roles");
  const services = createAppServices();
  vi.mocked(services.rolesListScreen.fetchRoles).mockResolvedValue({ kind: "ok", value: [] });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("heading", { name: "Roles", level: 1 })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Nuevo rol" }));

  await expect.element(screen.getByRole("dialog").getByText("Nuevo rol")).toBeVisible();
  expect(window.location.pathname).toBe("/settings/roles");
  expect(services.rolesListScreen.roleEditorModal?.createRole).not.toHaveBeenCalled();
});

test("opens the role editor modal for editing, from a role's pencil action, with Roles still the active sidebar item", async () => {
  // A desktop-sized viewport keeps this row action clear of the rail at the default phone-sized viewport.
  await page.viewport(1280, 900);
  const services = createAppServices();
  const roleEditorModal = services.rolesListScreen.roleEditorModal;
  if (!roleEditorModal) {
    throw new Error("test setup: createAppServices always fills roleEditorModal");
  }
  vi.mocked(services.rolesListScreen.fetchRoles).mockResolvedValue({
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
  vi.mocked(roleEditorModal.fetchRole).mockResolvedValue({
    kind: "ok",
    value: {
      id: "role-stock",
      name: "Depósito",
      isAdministrator: false,
      permissionKeys: [],
      userCount: 0,
      version: 1,
      assignedUsers: [],
    },
  });
  window.history.pushState(null, "", "/settings/roles");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("heading", { name: "Roles", level: 1 })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Editar el rol Depósito" }));

  await expect.element(screen.getByRole("dialog").getByText("Editar rol")).toBeVisible();
  await expect
    .poll(() => services.rolesListScreen.roleEditorModal?.fetchRole)
    .toHaveBeenCalledWith("role-stock");
  const rolesItem = screen.getByRole("link", { name: "Roles" }).element() as HTMLAnchorElement;
  expect(rolesItem.getAttribute("aria-current")).toBe("page");
  expect(window.location.pathname).toBe("/settings/roles");
});

test("opens the role editor modal for duplicating, pre-filled from the source row, without refetching the list", async () => {
  await page.viewport(1280, 900);
  const services = createAppServices();
  const fetchRoles = vi.mocked(services.rolesListScreen.fetchRoles);
  fetchRoles.mockResolvedValue({
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
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("heading", { name: "Roles", level: 1 })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Duplicar el rol Depósito" }));

  await expect.element(screen.getByRole("dialog").getByText("Duplicar rol")).toBeVisible();
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Copia de Depósito");
  const rolesItem = screen.getByRole("link", { name: "Roles" }).element() as HTMLAnchorElement;
  expect(rolesItem.getAttribute("aria-current")).toBe("page");
  expect(fetchRoles).toHaveBeenCalledTimes(1);
});

test("redirects a non-Administrator's typed /settings/roles to Mi cuenta, without listing roles", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/settings/roles");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/settings/users/me");
  expect(services.rolesListScreen.fetchRoles).not.toHaveBeenCalled();
});

test("redirects a non-Administrator's typed /settings/users to Mi cuenta, without listing users", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/settings/users");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/settings/users/me");
  expect(services.usersListScreen.fetchUsers).not.toHaveBeenCalled();
});

test("shows Mi cuenta's own sidebar entry instead of Usuarios for a non-Administrator", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
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
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Hopper",
        isAdministrator: false,
        permissions: ["deactivate_users"],
      }),
    ),
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
        isLastActiveAdministrator: false,
      },
    ],
  });
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
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Hopper",
        isAdministrator: false,
        permissions: ["deactivate_users"],
      }),
    ),
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
      isLastActiveAdministrator: false,
    },
  });
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
])(
  "redirects a non-Administrator's typed $path to Mi cuenta, without calling its API",
  async ({ path, adminOnlyCalls }) => {
    const services = createAppServices({
      fetchSession: vi
        .fn()
        .mockResolvedValue(
          openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
        ),
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
  const services = createAppServices();
  vi.mocked(services.usersListScreen.fetchUsers).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.usersListScreen.fetchRoles).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/settings/users");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("link", { name: "Roles" })).toBeVisible();

  vi.mocked(services.fetchSession).mockResolvedValue(openSession({ isAdministrator: false }));
  vi.setSystemTime(Date.now() + PAST_ACTIVITY_THROTTLE_WINDOW_MS);
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
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/settings/users/me");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(screen.getByRole("link", { name: "Roles" }).query()).toBeNull();

  vi.mocked(services.fetchSession).mockResolvedValue(
    openSession({ userId: "user-2", displayName: "Grace Hopper" }),
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
  window.history.pushState(null, "", "/settings/users/me");

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

test("shows the Catálogo item in the rail for a user holding manage_products_and_categories, linking to the products list", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Hopper",
        isAdministrator: false,
        permissions: ["manage_products_and_categories"],
      }),
    ),
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("link", { name: "Catálogo" })).toBeVisible();
});

test("hides the Catálogo item in the rail for a user without the permission", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Catálogo" }).query()).toBeNull();
});

test("shows the Inicio item in the rail for a user holding view_branch_alerts, linking to Alertas", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Hopper",
        isAdministrator: false,
        permissions: ["view_branch_alerts"],
      }),
    ),
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("link", { name: "Inicio" })).toBeVisible();
});

test("hides the Inicio item in the rail for a user without either alert-view permission", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Inicio" }).query()).toBeNull();
});

test("following the rail's Inicio item opens the Alertas list, with Inicio and Alertas active", async () => {
  window.history.pushState(null, "", "/help");
  const services = createAppServices();
  vi.mocked(services.alertsListScreen.fetchAlerts).mockResolvedValue({
    kind: "ok",
    value: { alerts: [], total: 0, pageSize: 25, openCount: 0, openCriticalCount: 0 },
  });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("link", { name: "Inicio" })).toBeVisible();

  await userEvent.click(screen.getByRole("link", { name: "Inicio" }));

  await expect.element(screen.getByRole("heading", { name: "Alertas", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/home/alerts");
  const homeItem = screen.getByRole("link", { name: "Inicio" }).element() as HTMLAnchorElement;
  expect(homeItem.getAttribute("aria-current")).toBe("page");
  const alertsItem = screen.getByRole("link", { name: "Alertas" }).element() as HTMLAnchorElement;
  expect(alertsItem.getAttribute("aria-current")).toBe("page");
});

test.each(["/help", "/settings/users", "/catalog/categories", "/catalog/products"])(
  "lists Inicio above Catálogo in the rail on %s",
  async (path) => {
    window.history.pushState(null, "", path);
    const services = createAppServices();
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
    await expect.element(rail.getByRole("link", { name: "Inicio" })).toBeVisible();
    const labels = rail
      .getByRole("link")
      .elements()
      .map((link) => link.textContent);
    expect(labels.indexOf("Inicio")).toBeLessThan(labels.indexOf("Catálogo"));
  },
);

test.each(["/help", "/settings/users", "/catalog/categories", "/catalog/products"])(
  "lists Catálogo above Config in the rail on %s",
  async (path) => {
    window.history.pushState(null, "", path);
    const services = createAppServices();
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
  const services = createAppServices();
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
  const services = createAppServices();
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
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/catalog/categories");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/settings/users/me");
  expect(services.categoriesListScreen.fetchCategories).not.toHaveBeenCalled();
});

test("navigating directly to /catalog/brands opens the brands list, with Marcas active", async () => {
  window.history.pushState(null, "", "/catalog/brands");
  const services = createAppServices();
  vi.mocked(services.brandsListScreen.fetchBrands).mockResolvedValue({ kind: "ok", value: [] });

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Marcas", level: 1 })).toBeVisible();
  const brandsItem = screen.getByRole("link", { name: "Marcas" }).element() as HTMLAnchorElement;
  expect(brandsItem.getAttribute("aria-current")).toBe("page");
  window.history.pushState(null, "", "/");
});

test("redirects a non-permitted user's typed /catalog/brands to Mi cuenta, without listing brands", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/catalog/brands");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/settings/users/me");
  expect(services.brandsListScreen.fetchBrands).not.toHaveBeenCalled();
});

test("redirects a non-permitted user's typed /catalog/products to Mi cuenta, without listing products", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/catalog/products");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/settings/users/me");
  expect(services.productsListScreen.fetchProducts).not.toHaveBeenCalled();
});

test("redirects a non-permitted user's typed /catalog/prices to Mi cuenta, without listing prices", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/catalog/prices");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/settings/users/me");
  expect(services.pricesListScreen.fetchPrices).not.toHaveBeenCalled();
});

test("redirects a user holding only manage_products_and_categories away from a typed /catalog/prices", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Hopper",
        isAdministrator: false,
        permissions: ["manage_products_and_categories"],
      }),
    ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/catalog/prices");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(services.pricesListScreen.fetchPrices).not.toHaveBeenCalled();
});

test("redirects a user holding only manage_prices_and_review away from a typed /catalog/products", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Hopper",
        isAdministrator: false,
        permissions: ["manage_prices_and_review"],
      }),
    ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/catalog/products");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(services.productsListScreen.fetchProducts).not.toHaveBeenCalled();
});

test("shows the Precios section, and only it, for a user holding only manage_prices_and_review, opening it by default from the rail's Catálogo item", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Hopper",
        isAdministrator: false,
        permissions: ["manage_prices_and_review"],
      }),
    ),
  });
  vi.mocked(services.pricesListScreen.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: {
      products: [],
      pendingCount: 0,
      activeProductCount: 3,
      reviewWindowDays: 30,
      categories: [],
    },
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("link", { name: "Catálogo" }));

  await expect.element(screen.getByRole("heading", { name: "Precios", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/catalog/prices");
  expect(screen.getByRole("link", { name: "Productos" }).query()).toBeNull();
  expect(screen.getByRole("link", { name: "Categorías" }).query()).toBeNull();
  expect(screen.getByRole("link", { name: "Marcas" }).query()).toBeNull();
  await expect.element(screen.getByRole("link", { name: "Precios" })).toBeVisible();
});

test("hides the Precios section item for a user holding only manage_products_and_categories", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Hopper",
        isAdministrator: false,
        permissions: ["manage_products_and_categories"],
      }),
    ),
  });
  window.history.pushState(null, "", "/catalog/products");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Productos", level: 1 })).toBeVisible();
  expect(screen.getByRole("link", { name: "Precios" }).query()).toBeNull();
});

test("shows the Caja item in the rail for a user holding change_fiscal_configuration, linking to Configuración fiscal", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Hopper",
        isAdministrator: false,
        permissions: ["change_fiscal_configuration"],
      }),
    ),
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("link", { name: "Caja" })).toBeVisible();
});

test("hides the Caja item in the rail for a user without change_fiscal_configuration", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Caja" }).query()).toBeNull();
});

test.each([
  "/help",
  "/settings/users",
  "/catalog/products",
  "/cash-and-fiscal/fiscal-configuration",
])("lists Catálogo, then Caja, then Config in the rail on %s", async (path) => {
  window.history.pushState(null, "", path);
  const services = createAppServices();
  vi.mocked(services.productsListScreen.fetchProducts).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  vi.mocked(services.productsListScreen.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  vi.mocked(services.fiscalConfigurationScreen.fetchIssuerIdentification).mockResolvedValue({
    kind: "ok",
    value: {
      legalName: "María Laura Fernández",
      grossIncomeRegistration: "1284531-06",
      activityStartDate: "2019-03-01",
      authorizedCuit: "27-28453196-0",
      taxStatus: "Responsable Monotributo",
      version: 1,
    },
  });

  const screen = await render(<App help={emptyHelp} services={services} />);

  const rail = screen.getByRole("navigation", { name: "Áreas" });
  await expect.element(rail.getByRole("link", { name: "Caja" })).toBeVisible();
  const labels = rail
    .getByRole("link")
    .elements()
    .map((link) => link.textContent);
  expect(labels.indexOf("Catálogo")).toBeLessThan(labels.indexOf("Caja"));
  expect(labels.indexOf("Caja")).toBeLessThan(labels.indexOf("Config"));
});

test("following the rail's Caja item opens Configuración fiscal, with Caja and Configuración fiscal active", async () => {
  window.history.pushState(null, "", "/help");
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Hopper",
        isAdministrator: false,
        permissions: ["change_fiscal_configuration"],
      }),
    ),
  });
  vi.mocked(services.fiscalConfigurationScreen.fetchIssuerIdentification).mockResolvedValue({
    kind: "ok",
    value: {
      legalName: null,
      grossIncomeRegistration: null,
      activityStartDate: null,
      authorizedCuit: "27-28453196-0",
      taxStatus: "Responsable Monotributo",
      version: 1,
    },
  });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("link", { name: "Caja" })).toBeVisible();

  await userEvent.click(screen.getByRole("link", { name: "Caja" }));

  await expect
    .element(screen.getByRole("heading", { name: "Configuración fiscal", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/cash-and-fiscal/fiscal-configuration");
  const cashItem = screen.getByRole("link", { name: "Caja" }).element() as HTMLAnchorElement;
  expect(cashItem.getAttribute("aria-current")).toBe("page");
  const sectionItem = screen
    .getByRole("link", { name: "Configuración fiscal" })
    .element() as HTMLAnchorElement;
  expect(sectionItem.getAttribute("aria-current")).toBe("page");
});

test("redirects a non-permitted user's typed /cash-and-fiscal/fiscal-configuration to Mi cuenta, without loading it", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/cash-and-fiscal/fiscal-configuration");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/settings/users/me");
  expect(services.fiscalConfigurationScreen.fetchIssuerIdentification).not.toHaveBeenCalled();
});

test("reopens the products list with the filters and ordering its URL carries", async () => {
  const services = createAppServices();
  vi.mocked(services.productsListScreen.fetchProducts).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.productsListScreen.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  window.history.pushState(null, "", "/catalog/products?search=miel&unit=KG&status=inactive");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByPlaceholder("Buscar por nombre o código de barras"))
    .toHaveValue("miel");
  await expect.element(screen.getByRole("button", { name: "Unidad: Por peso" })).toBeVisible();
  await expect
    .poll(() => services.productsListScreen.fetchProducts)
    .toHaveBeenCalledWith("inactive");
});

test("reopens the products list searching the barcode its URL carries", async () => {
  const services = createAppServices();
  vi.mocked(services.productsListScreen.fetchProducts).mockResolvedValue({
    kind: "ok",
    value: [honey, almonds],
  });
  vi.mocked(services.productsListScreen.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  window.history.pushState(null, "", `/catalog/products?search=${honey.barcodes[0]}`);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByPlaceholder("Buscar por nombre o código de barras"))
    .toHaveValue(honey.barcodes[0]);
  await expect.element(screen.getByText(honey.name)).toBeVisible();
  expect(screen.getByText(almonds.name).query()).toBeNull();
});

test("keeps a products list filter change in the URL, replacing the history entry instead of adding one", async () => {
  const services = createAppServices();
  vi.mocked(services.productsListScreen.fetchProducts).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.productsListScreen.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  window.history.pushState(null, "", "/help");
  window.history.pushState(null, "", "/catalog/products");
  const screen = await render(<App help={emptyHelp} services={services} />);
  const searchBox = screen.getByPlaceholder("Buscar por nombre o código de barras");
  await expect.element(searchBox).toBeVisible();

  await userEvent.fill(searchBox, "miel");
  await userEvent.click(screen.getByRole("button", { name: "Estado: Activos" }));
  await userEvent.click(screen.getByRole("option", { name: "Todos" }));

  await expect.poll(() => new URLSearchParams(window.location.search).get("status")).toBe("all");
  expect(new URLSearchParams(window.location.search).get("search")).toBe("miel");

  window.history.back();

  await expect.poll(() => window.location.pathname).toBe("/help");
});

test("opens a list on its defaults for a filter value its URL carries that the list does not offer", async () => {
  const services = createAppServices();
  vi.mocked(services.productsListScreen.fetchProducts).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.productsListScreen.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  window.history.pushState(null, "", "/catalog/products?status=archived&sort=sideways");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("button", { name: "Estado: Activos" })).toBeVisible();
  await expect.poll(() => services.productsListScreen.fetchProducts).toHaveBeenCalledWith("active");
});

test("reopens the categories list with the search its URL carries", async () => {
  const services = createAppServices();
  vi.mocked(services.categoriesListScreen.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  window.history.pushState(null, "", "/catalog/categories?search=alma&sort=descending");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByPlaceholder("Buscar una categoría")).toHaveValue("alma");
});

test("reopens the prices list with the filters its URL carries", async () => {
  const services = createAppServices();
  window.history.pushState(null, "", "/catalog/prices?search=yerba&review=all");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByPlaceholder("Buscar un producto")).toHaveValue("yerba");
  await expect
    .poll(() => services.pricesListScreen.fetchPrices)
    .toHaveBeenCalledWith({
      review: "all",
      search: "yerba",
    });
});

test("reopens the users list on the state its URL carries", async () => {
  const services = createAppServices();
  vi.mocked(services.usersListScreen.fetchUsers).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.usersListScreen.fetchRoles).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/settings/users?state=inactive");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("button", { name: /^Estado: Inactivos/ })).toBeVisible();
});

test("reopens the alerts list with the filters and page its URL carries", async () => {
  const services = createAppServices();
  window.history.pushState(null, "", "/home/alerts?level=critical&status=closed&page=2");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Alertas", level: 1 })).toBeVisible();
  await expect
    .poll(() => services.alertsListScreen.fetchAlerts)
    .toHaveBeenCalledWith({
      level: "critical",
      open: false,
      page: 2,
    });
});

test("keeps the products list filters in the URL after following its own section link", async () => {
  const services = createAppServices();
  vi.mocked(services.productsListScreen.fetchProducts).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.productsListScreen.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  window.history.pushState(null, "", "/help");
  window.history.pushState(null, "", "/catalog/products?search=miel");
  const screen = await render(<App help={emptyHelp} services={services} />);
  const searchBox = screen.getByPlaceholder("Buscar por nombre o código de barras");
  await expect.element(searchBox).toHaveValue("miel");
  const productsLink = screen.getByRole("link", { name: "Productos" });
  await expect.element(productsLink).toHaveAttribute("href", "/catalog/products?search=miel");

  await userEvent.click(productsLink);

  await expect.element(searchBox).toHaveValue("miel");
  await expect.poll(() => new URLSearchParams(window.location.search).get("search")).toBe("miel");
  window.history.back();
  await expect.poll(() => window.location.pathname).toBe("/help");
});

test.each([
  { url: "/catalog/categories?search=alma", link: "Categorías" },
  { url: "/catalog/prices?search=yerba", link: "Precios" },
  { url: "/settings/users?state=inactive", link: "Usuarios" },
  { url: "/home/alerts?status=closed", link: "Alertas" },
])("the $link section link carries the filters its list is showing", async ({ url, link }) => {
  const services = createAppServices();
  vi.mocked(services.categoriesListScreen.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  vi.mocked(services.usersListScreen.fetchUsers).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.usersListScreen.fetchRoles).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", url);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("link", { name: link })).toHaveAttribute("href", url);
});

test.each([
  { url: "/home/alerts?status=closed", link: "Inicio" },
  { url: "/catalog/products?search=miel", link: "Catálogo" },
])("the $link rail link keeps the filters its list is showing", async ({ url, link }) => {
  const services = createAppServices();
  vi.mocked(services.productsListScreen.fetchProducts).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.productsListScreen.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  window.history.pushState(null, "", "/help");
  window.history.pushState(null, "", url);
  const screen = await render(<App help={emptyHelp} services={services} />);
  const railLink = screen.getByRole("link", { name: link });
  await expect.element(railLink).toHaveAttribute("href", url);

  await userEvent.click(railLink);

  await expect.poll(() => `${window.location.pathname}${window.location.search}`).toBe(url);
  window.history.back();
  await expect.poll(() => window.location.pathname).toBe("/help");
});

test.each([
  {
    url: "/catalog/products?status=inactive&search=miel",
    canonical: "/catalog/products?search=miel&status=inactive",
    status: "Estado: Inactivos",
  },
  {
    url: "/catalog/products?search=miel&category=ALL",
    canonical: "/catalog/products?search=miel",
    status: "Estado: Activos",
  },
  {
    url: "/catalog/products?status=bogus",
    canonical: "/catalog/products",
    status: "Estado: Activos",
  },
  {
    url: "/catalog/products?search=miel&origin=mail",
    canonical: "/catalog/products?search=miel",
    status: "Estado: Activos",
  },
  {
    url: "/catalog/products?search=miel&status=inactive",
    canonical: "/catalog/products?search=miel&status=inactive",
    status: "Estado: Inactivos",
  },
])(
  "opening $url ends on $canonical without a history entry of its own",
  async ({ url, canonical, status }) => {
    const services = createAppServices();
    vi.mocked(services.productsListScreen.fetchProducts).mockResolvedValue({
      kind: "ok",
      value: [],
    });
    vi.mocked(services.productsListScreen.fetchCategories).mockResolvedValue({
      kind: "ok",
      value: [],
    });
    window.history.pushState(null, "", "/help");
    window.history.pushState(null, "", url);

    const screen = await render(<App help={emptyHelp} services={services} />);

    await expect.element(screen.getByRole("button", { name: status })).toBeVisible();
    await expect.poll(() => `${window.location.pathname}${window.location.search}`).toBe(canonical);
    await expect
      .element(screen.getByRole("link", { name: "Productos" }))
      .toHaveAttribute("href", canonical);
    window.history.back();
    await expect.poll(() => window.location.pathname).toBe("/help");
  },
);

test("offers to try again when a screen fails to render, reports the failure, and shows the screen once it works", async () => {
  window.history.pushState(null, "", "/home/alerts");
  const services = createAppServices();
  const unreadable = { active: true };
  const page = {
    get alerts(): never[] {
      if (unreadable.active) {
        throw new TypeError("the alerts cannot be read");
      }
      return [];
    },
    total: 0,
    pageSize: 25,
    openCount: 0,
    openCriticalCount: 0,
  };
  vi.mocked(services.alertsListScreen.fetchAlerts).mockResolvedValue({ kind: "ok", value: page });
  const reportError = vi.fn();
  const screen = await render(
    <App help={emptyHelp} services={services} reportError={reportError} />,
  );

  await expect.element(screen.getByText("No pudimos mostrar esta pantalla")).toBeVisible();
  expect(reportError).toHaveBeenCalledTimes(1);
  expect(reportError).toHaveBeenCalledWith(expect.any(TypeError));

  unreadable.active = false;
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByRole("heading", { name: "Alertas", level: 1 })).toHaveFocus();
  expect(screen.getByText("No pudimos mostrar esta pantalla").query()).toBeNull();
  expect(reportError).toHaveBeenCalledTimes(1);
});

test("moves focus to the failure's title when a screen opened from the rail fails once its data arrives", async () => {
  window.history.pushState(null, "", "/help");
  const services = createAppServices();
  vi.mocked(services.alertsListScreen.fetchAlerts).mockResolvedValue({
    kind: "ok",
    value: { alerts: null, total: 0, pageSize: 25, openCount: 0, openCriticalCount: 0 },
  } as never);
  const screen = await render(<App help={emptyHelp} services={services} reportError={vi.fn()} />);
  await expect.element(screen.getByRole("link", { name: "Inicio" })).toBeVisible();

  await userEvent.click(screen.getByRole("link", { name: "Inicio" }));

  await expect
    .element(screen.getByRole("heading", { name: "No pudimos mostrar esta pantalla", level: 1 }))
    .toHaveFocus();
});

test("keeps focus on the failure's title when trying again fails again", async () => {
  window.history.pushState(null, "", "/home/alerts");
  const services = createAppServices();
  vi.mocked(services.alertsListScreen.fetchAlerts).mockResolvedValue({
    kind: "ok",
    value: { alerts: null, total: 0, pageSize: 25, openCount: 0, openCriticalCount: 0 },
  } as never);
  const reportError = vi.fn();
  const screen = await render(
    <App help={emptyHelp} services={services} reportError={reportError} />,
  );
  await expect
    .element(screen.getByRole("heading", { name: "No pudimos mostrar esta pantalla", level: 1 }))
    .toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.poll(() => reportError.mock.calls.length).toBeGreaterThan(1);
  await expect
    .element(screen.getByRole("heading", { name: "No pudimos mostrar esta pantalla", level: 1 }))
    .toHaveFocus();
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("Probá de nuevo en unos minutos.");
});
