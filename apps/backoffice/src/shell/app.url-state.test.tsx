import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { almonds, honey } from "../catalog/test-support/products";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";

beforeEach(resetPageState);

afterEach(resetPageState);

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

test("reopens the promotions list with the filters its URL carries", async () => {
  const services = createAppServices();
  window.history.pushState(null, "", "/catalog/discounts?search=yerba&status=all&kind=PERCENT_OFF");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByPlaceholder("Buscar una promoción")).toHaveValue("yerba");
  await expect.element(screen.getByRole("button", { name: "Estado: Todas" })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Tipo: Porcentaje" })).toBeVisible();
});

test("rewrites a promotions URL that names a value the list does not offer, without adding a history entry", async () => {
  const services = createAppServices();
  window.history.pushState(null, "", "/help");
  window.history.pushState(
    null,
    "",
    "/catalog/discounts?status=archived&kind=combo&sortBy=days&sort=sideways&search=miel",
  );
  const historyLength = window.history.length;

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("button", { name: "Estado: Vigentes y programadas" }))
    .toBeVisible();
  await expect.poll(() => window.location.search).toBe("?search=miel");
  expect(window.history.length).toBe(historyLength);
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
  { url: "/catalog/discounts?search=yerba", link: "Promociones" },
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

test("the Catálogo rail link keeps the filters its list is showing", async () => {
  const url = "/catalog/products?search=miel";
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
  const railLink = screen.getByRole("link", { name: "Catálogo" });
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
