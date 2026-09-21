import { defineHelp } from "@purosur/ui";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { AyudaContent, AyudaSectionColumn } from "./AyudaScreen";

const help = defineHelp("es-AR", {
  categories: {
    getting_started: { label: "Primeros pasos", icon: "flag" },
    billing: { label: "Facturación" },
  },
  articles: {
    intro: {
      category: "getting_started",
      title: "Bienvenida",
      body: [
        { kind: "heading", text: "Antes de empezar" },
        { kind: "paragraph", text: "Configurá tu catálogo antes de abrir la caja." },
        { kind: "steps", items: ["Cargá tus productos", "Abrí la caja"] },
        { kind: "note", text: "Podés cambiar esto más adelante." },
        { kind: "articleLink", article: "billing_basics" },
      ],
      related: ["billing_basics"],
    },
    billing_basics: {
      category: "billing",
      title: "Facturación básica",
      body: [{ kind: "paragraph", text: "Cómo emitir una factura." }],
    },
  },
});

beforeEach(() => {
  window.history.pushState(null, "", "/ayuda");
});

afterEach(() => {
  window.history.pushState(null, "", "/");
});

test("AyudaSectionColumn lists every category as a link, marking the active one", async () => {
  const screen = await render(<AyudaSectionColumn help={help} activeCategoryId="billing" />);

  await expect.element(screen.getByText("Ayuda")).toBeVisible();

  const gettingStarted = screen
    .getByRole("link", { name: "Primeros pasos" })
    .element() as HTMLAnchorElement;
  expect(gettingStarted.getAttribute("href")).toBe("/ayuda/getting_started");
  expect(gettingStarted.hasAttribute("aria-current")).toBe(false);

  const billing = screen.getByRole("link", { name: "Facturación" }).element() as HTMLAnchorElement;
  expect(billing.getAttribute("aria-current")).toBe("page");
});

test("AyudaSectionColumn lists the categories as list items under its heading", async () => {
  const screen = await render(<AyudaSectionColumn help={help} activeCategoryId={null} />);

  await expect.element(screen.getByRole("heading", { name: "Ayuda", level: 2 })).toBeVisible();
  const items = screen.getByRole("list").getByRole("listitem").elements();
  expect(items.map((item) => item.textContent)).toEqual(["Primeros pasos", "Facturación"]);
});

test("AyudaSectionColumn renders no items for an empty catalog", async () => {
  const empty = defineHelp("es-AR", { categories: {}, articles: {} });
  const screen = await render(<AyudaSectionColumn help={empty} activeCategoryId={null} />);

  expect(screen.container.querySelectorAll("a").length).toBe(0);
});

function ContentHarness(props: {
  categoryId: string | null;
  articleId: string | null;
  search?: string;
}) {
  return (
    <AyudaContent
      help={help}
      categoryId={props.categoryId}
      articleId={props.articleId}
      search={props.search ?? ""}
      onSearchChange={() => {}}
    />
  );
}

test("shows the empty-catalog state and the search field when the catalog has no articles", async () => {
  const empty = defineHelp("es-AR", { categories: {}, articles: {} });
  const screen = await render(
    <AyudaContent
      help={empty}
      categoryId={null}
      articleId={null}
      search=""
      onSearchChange={() => {}}
    />,
  );

  await expect.element(screen.getByRole("searchbox", { name: "Buscar en la ayuda" })).toBeVisible();
  await expect.element(screen.getByText("Todavía no hay contenido de ayuda")).toBeVisible();
});

test("prompts to pick a section, not the empty-catalog state, when the catalog has articles", async () => {
  const screen = await render(<ContentHarness categoryId={null} articleId={null} />);

  await expect.element(screen.getByText("Elegí una sección")).toBeVisible();
  await expect.element(screen.getByText("O buscá un tema.")).toBeVisible();
  expect(screen.getByText("Todavía no hay contenido de ayuda").query()).toBeNull();
});

test("lists a selected category's articles as links, under its breadcrumb", async () => {
  const screen = await render(<ContentHarness categoryId="getting_started" articleId={null} />);

  await expect.element(screen.getByText("Ayuda · Primeros pasos")).toBeVisible();

  const link = screen.getByRole("link", { name: "Bienvenida" }).element() as HTMLAnchorElement;
  expect(link.getAttribute("href")).toBe("/ayuda/getting_started/intro");
});

test("renders a selected article's breadcrumb, title and every block kind", async () => {
  const screen = await render(<ContentHarness categoryId="getting_started" articleId="intro" />);

  await expect.element(screen.getByText("Ayuda · Primeros pasos")).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Bienvenida" })).toBeVisible();
  await expect.element(screen.getByText("Antes de empezar")).toBeVisible();
  await expect
    .element(screen.getByText("Configurá tu catálogo antes de abrir la caja."))
    .toBeVisible();
  await expect.element(screen.getByText("Cargá tus productos")).toBeVisible();
  await expect.element(screen.getByText("Abrí la caja")).toBeVisible();
  await expect.element(screen.getByText("Podés cambiar esto más adelante.")).toBeVisible();

  // "Facturación básica" appears twice: once as this article's own articleLink block, once again
  // in the related panel (both point at the same article on purpose, per the fixture above).
  const articleLinks = screen.getByRole("link", { name: "Facturación básica" }).elements();
  expect(articleLinks).toHaveLength(2);
  for (const link of articleLinks) {
    expect((link as HTMLAnchorElement).getAttribute("href")).toBe("/ayuda/billing/billing_basics");
  }
});

test("gives an article's structure to assistive technology as headings and lists", async () => {
  const screen = await render(<ContentHarness categoryId="getting_started" articleId="intro" />);

  await expect.element(screen.getByRole("heading", { name: "Bienvenida", level: 1 })).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Antes de empezar", level: 2 }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "También te puede servir", level: 2 }))
    .toBeVisible();

  const steps = screen.getByRole("list").filter({ hasText: "Cargá tus productos" });
  expect((steps.element() as HTMLElement).tagName).toBe("OL");
  expect(
    steps
      .getByRole("listitem")
      .elements()
      .map((item) => item.textContent),
  ).toEqual(["1Cargá tus productos", "2Abrí la caja"]);

  const related = screen.getByRole("navigation", { name: "También te puede servir" });
  expect(related.getByRole("listitem").elements()).toHaveLength(1);
});

test("lists a category's articles and search results as list items", async () => {
  const category = await render(<ContentHarness categoryId="getting_started" articleId={null} />);
  expect(
    category
      .getByRole("listitem")
      .elements()
      .map((item) => item.textContent),
  ).toEqual(["Bienvenida"]);
  await category.unmount();

  const results = await render(
    <ContentHarness categoryId={null} articleId={null} search="factura" />,
  );
  expect(
    results
      .getByRole("listitem")
      .elements()
      .map((item) => item.textContent),
  ).toEqual(["Facturación básica"]);
});

// toBeVisible() accepts a visually hidden (sr-only) element, whose clipped box is 1px wide.
function isRenderedOnScreen(element: Element): boolean {
  return element.getBoundingClientRect().width > 1;
}

test("titles every state with an on-screen level-1 heading", async () => {
  const home = await render(<ContentHarness categoryId={null} articleId={null} />);
  const homeHeading = home.getByRole("heading", { name: "Ayuda", level: 1 });
  await expect.element(homeHeading).toBeVisible();
  expect(isRenderedOnScreen(homeHeading.element())).toBe(true);
  await home.unmount();

  const section = await render(<ContentHarness categoryId="billing" articleId={null} />);
  const sectionHeading = section.getByRole("heading", { name: "Facturación", level: 1 });
  await expect.element(sectionHeading).toBeVisible();
  expect(isRenderedOnScreen(sectionHeading.element())).toBe(true);
});

// React logs a duplicate-key warning only after the render commits, so the spy stays installed
// for a tick past the render before it is read.
async function collectKeyWarnings(renderContent: () => Promise<unknown>): Promise<string[]> {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  await renderContent();
  await new Promise((resolve) => setTimeout(resolve, 50));
  const warnings = spy.mock.calls
    .map((call) => call.map(String).join(" "))
    .filter((message) => message.includes("same key"));
  spy.mockRestore();
  return warnings;
}

test("the duplicate-key probe catches colliding keys", async () => {
  const warnings = await collectKeyWarnings(() =>
    render(
      <ul>
        {["same", "same"].map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>,
    ),
  );

  expect(warnings).not.toEqual([]);
});

test("renders repeated blocks, steps and related articles without colliding keys", async () => {
  const repetitive = defineHelp("es-AR", {
    categories: { getting_started: { label: "Primeros pasos" } },
    articles: {
      intro: {
        category: "getting_started",
        title: "Bienvenida",
        body: [
          { kind: "note", text: "Guardá los cambios." },
          { kind: "steps", items: ["Revisá", "Confirmá", "Revisá"] },
          { kind: "note", text: "Guardá los cambios." },
          { kind: "steps", items: ["Revisá", "Confirmá", "Revisá"] },
          { kind: "articleLink", article: "other" },
          { kind: "articleLink", article: "other" },
        ],
        related: ["other", "other"],
      },
      other: { category: "getting_started", title: "Otro", body: [] },
    },
  });

  const warnings = await collectKeyWarnings(() =>
    render(
      <AyudaContent
        help={repetitive}
        categoryId="getting_started"
        articleId="intro"
        search=""
        onSearchChange={() => {}}
      />,
    ),
  );

  expect(warnings).toEqual([]);
});

test("renders the related panel from the article's related list", async () => {
  const screen = await render(<ContentHarness categoryId="getting_started" articleId="intro" />);

  await expect.element(screen.getByText("También te puede servir")).toBeVisible();
  const related = screen
    .getByRole("navigation", { name: "También te puede servir" })
    .getByRole("link", { name: "Facturación básica" })
    .element() as HTMLAnchorElement;
  expect(related.getAttribute("href")).toBe("/ayuda/billing/billing_basics");
});

test("filters to matching articles across every category when searching", async () => {
  const screen = await render(
    <ContentHarness categoryId={null} articleId={null} search="factura" />,
  );

  const link = screen
    .getByRole("link", { name: "Facturación básica" })
    .element() as HTMLAnchorElement;
  expect(link.getAttribute("href")).toBe("/ayuda/billing/billing_basics");
  expect(screen.getByRole("link", { name: "Bienvenida" }).query()).toBeNull();
});

test("shows a no-results state for a search that matches nothing", async () => {
  const screen = await render(
    <ContentHarness categoryId={null} articleId={null} search="xyzxyz" />,
  );

  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
});

test("typing in the search field calls onSearchChange", async () => {
  const onSearchChange = vi.fn();
  const screen = await render(
    <AyudaContent
      help={help}
      categoryId={null}
      articleId={null}
      search=""
      onSearchChange={onSearchChange}
    />,
  );

  await userEvent.click(screen.getByRole("searchbox", { name: "Buscar en la ayuda" }));
  // The field is controlled and this harness never feeds a new `search` prop back in, so each
  // keystroke's event carries only that one character rather than an accumulating value — this
  // still proves the field is wired to onSearchChange without depending on that plumbing.
  await userEvent.keyboard("f");

  expect(onSearchChange).toHaveBeenCalledWith("f");
});
