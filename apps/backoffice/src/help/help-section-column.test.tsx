import { defineHelp } from "@purosur/ui";
import { afterEach, beforeEach, expect, test } from "vitest";
import { render } from "../shell/test-support/render-with-router";
import { HelpSectionColumn } from "./help-section-column";

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
  window.history.pushState(null, "", "/help");
});

afterEach(() => {
  window.history.pushState(null, "", "/");
});

test("HelpSectionColumn lists every category as a link, marking the active one", async () => {
  const screen = await render(<HelpSectionColumn help={help} activeCategoryId="billing" />);

  await expect.element(screen.getByText("Ayuda")).toBeVisible();

  const gettingStarted = screen
    .getByRole("link", { name: "Primeros pasos" })
    .element() as HTMLAnchorElement;
  expect(gettingStarted.getAttribute("href")).toBe("/help/getting_started");
  expect(gettingStarted.hasAttribute("aria-current")).toBe(false);

  const billing = screen.getByRole("link", { name: "Facturación" }).element() as HTMLAnchorElement;
  expect(billing.getAttribute("aria-current")).toBe("page");
});

test("HelpSectionColumn lists the categories as list items under its heading", async () => {
  const screen = await render(<HelpSectionColumn help={help} activeCategoryId={null} />);

  await expect.element(screen.getByRole("heading", { name: "Ayuda", level: 2 })).toBeVisible();
  const items = screen.getByRole("list").getByRole("listitem").elements();
  expect(items.map((item) => item.textContent)).toEqual(["Primeros pasos", "Facturación"]);
});

test("HelpSectionColumn renders no items for an empty catalog", async () => {
  const empty = defineHelp("es-AR", { categories: {}, articles: {} });
  const screen = await render(<HelpSectionColumn help={empty} activeCategoryId={null} />);

  expect(screen.container.querySelectorAll("a").length).toBe(0);
});
