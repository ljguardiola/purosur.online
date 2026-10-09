import { defineHelp } from "@purosur/ui";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { openSession } from "../access/test-support/open-session";
import { App, type AppServices } from "./app";
import { emptyHelp, help, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens([
  "/",
  "/account",
  "/account-recovery",
  "/help",
  "/products",
  "/roles",
  "/sign-in",
]);

beforeEach(resetPageState);

afterEach(resetPageState);

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
  window.history.pushState(null, "", "/account");
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

test("moves focus to the new screen's title, with a focus ring, after following a link with the keyboard between the screens reached without a session", async () => {
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

  const title = screen.getByRole("heading", { name: "Recuperar el acceso", level: 1 });
  await expect.element(title).toHaveFocus();
  const style = getComputedStyle(title.element());
  await expect.poll(() => style.outlineStyle).toBe("solid");
  expect(style.outlineWidth).toBe("3px");
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

  await expect.element(screen.getByRole("heading", { name: "Inicio", level: 1 })).toHaveFocus();
});

test("leaves focus where it is when only a list's filters change", async () => {
  const services = createAppServices();
  vi.mocked(services.productsListScreen.fetchProducts).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.productsListScreen.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  window.history.pushState(null, "", "/products");
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

test("shows a focus ring on the page heading it focuses after a keyboard navigation", async () => {
  window.history.pushState(null, "", "/help/getting_started");
  const screen = await render(<App help={help} services={createAppServices()} />);

  const link = screen.getByRole("link", { name: "Facturación", exact: true });
  await expect.element(link).toBeVisible();

  await pressEnterOn(link.element() as HTMLElement);

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
