import { defineHelp } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { CircleHelp, History } from "lucide-react";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { ActionEntry } from "../shell/action-entries";
import type { SignedInPerson } from "../shell/signed-in-person";
import { render } from "../shell/test-support/render-with-router";
import type { HelpScreenProps } from "./help-screen";
import { HelpScreen } from "./help-screen";

const PERSON: SignedInPerson = {
  user_id: "u1",
  first_name: "Ada",
  abilities: ["read_register_help", "view_sales_history"],
};

const HELP_ENTRY: ActionEntry = {
  label: "Ayuda",
  icon: CircleHelp,
  ability: "read_register_help",
  to: "/help",
};
const HISTORY_ENTRY: ActionEntry = {
  label: "Historial",
  icon: History,
  ability: "view_sales_history",
  to: "/sign-in",
};

const HELP = defineHelp("es-AR", {
  categories: {
    sales: { label: "Ventas" },
    cash: { label: "Efectivo" },
  },
  articles: {
    "scan-product": {
      category: "sales",
      title: "Escanear un producto",
      body: [
        { kind: "paragraph", text: "Pasá el código por el lector." },
        { kind: "articleLink", article: "cash-in" },
      ],
    },
    "cancel-sale": {
      category: "sales",
      title: "Cancelar una venta",
      body: [{ kind: "note", text: "No se cobra nada." }],
    },
    "cash-in": {
      category: "cash",
      title: "Registrar un ingreso",
      body: [{ kind: "steps", items: ["Tocá Caja.", "Elegí Ingreso de efectivo."] }],
    },
  },
});

async function renderScreen({
  registerName = null,
  help = HELP,
  signOut = vi.fn(),
}: {
  registerName?: string | null;
  help?: HelpScreenProps["help"];
  signOut?: () => void;
} = {}) {
  await page.viewport(1280, 900);
  onTestFinished(() => page.viewport(414, 896));
  const screen = await render(
    <HelpScreen
      person={PERSON}
      registerName={registerName}
      help={help}
      entries={[HELP_ENTRY, HISTORY_ENTRY]}
      signOut={signOut}
    />,
  );
  return { screen, signOut };
}

const SECTIONS = "Secciones de la ayuda";

describe("HelpScreen", () => {
  it("is titled Ayuda and names the register in the eyebrow", async () => {
    const { screen } = await renderScreen({ registerName: "Caja 1" });

    await expect.element(screen.getByRole("heading", { level: 1, name: "Ayuda" })).toBeVisible();
    await expect.element(screen.getByText("Caja 1", { exact: true })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("lists every section under the label of its category", async () => {
    const { screen } = await renderScreen();

    const sections = screen.getByRole("navigation", { name: SECTIONS });
    await expect.element(sections.getByRole("heading", { name: "Ventas" })).toBeVisible();
    await expect.element(sections.getByRole("heading", { name: "Efectivo" })).toBeVisible();
    const titles = Array.from(sections.element().querySelectorAll("button")).map(
      (button) => button.textContent,
    );
    expect(titles).toEqual(["Escanear un producto", "Cancelar una venta", "Registrar un ingreso"]);
  });

  it("shows the first section to begin with", async () => {
    const { screen } = await renderScreen();

    await expect
      .element(screen.getByRole("button", { name: "Escanear un producto" }))
      .toHaveAttribute("aria-current", "page");
    await expect
      .element(screen.getByRole("heading", { level: 2, name: "Escanear un producto" }))
      .toBeVisible();
    await expect.element(screen.getByText("Pasá el código por el lector.")).toBeVisible();
    await expect.element(screen.getByText("No se cobra nada.")).not.toBeInTheDocument();
  });

  it("begins with the first section listed when the catalog writes a later category's section first", async () => {
    const { screen } = await renderScreen({
      help: defineHelp("es-AR", {
        categories: HELP.categories,
        articles: {
          "cash-in": HELP.articles["cash-in"],
          "scan-product": HELP.articles["scan-product"],
        },
      }),
    });

    await expect
      .element(screen.getByRole("button", { name: "Escanear un producto" }))
      .toHaveAttribute("aria-current", "page");
    await expect.element(screen.getByText("Pasá el código por el lector.")).toBeVisible();
  });

  it("shows the section that is chosen", async () => {
    const { screen } = await renderScreen();

    await userEvent.click(screen.getByRole("button", { name: "Cancelar una venta" }));

    await expect
      .element(screen.getByRole("button", { name: "Cancelar una venta" }))
      .toHaveAttribute("aria-current", "page");
    await expect.element(screen.getByText("No se cobra nada.")).toBeVisible();
    await expect.element(screen.getByText("Pasá el código por el lector.")).not.toBeInTheDocument();
  });

  it("opens the section a link inside a section points to", async () => {
    const { screen } = await renderScreen();

    await userEvent.click(
      screen.getByRole("article").getByRole("button", { name: "Registrar un ingreso" }),
    );

    await expect.element(screen.getByText("Elegí Ingreso de efectivo.")).toBeVisible();
  });

  it("lists only the sections that mention what was typed", async () => {
    const { screen } = await renderScreen();

    await userEvent.type(screen.getByRole("searchbox", { name: "Buscar en la ayuda" }), "cobra");

    const sections = screen.getByRole("navigation", { name: SECTIONS });
    const titles = Array.from(sections.element().querySelectorAll("button")).map(
      (button) => button.textContent,
    );
    expect(titles).toEqual(["Cancelar una venta"]);
    await expect
      .element(sections.getByRole("heading", { name: "Efectivo" }))
      .not.toBeInTheDocument();
    await expect.element(screen.getByText("No se cobra nada.")).toBeVisible();
  });

  it("lists every section again once what was typed is cleared", async () => {
    const { screen } = await renderScreen();
    const search = screen.getByRole("searchbox", { name: "Buscar en la ayuda" });
    await userEvent.type(search, "cobra");

    await userEvent.clear(search);

    expect(
      screen.getByRole("navigation", { name: SECTIONS }).getByRole("button").elements(),
    ).toHaveLength(3);
  });

  it("says nothing was found when no section mentions what was typed", async () => {
    const { screen } = await renderScreen();

    await userEvent.type(screen.getByRole("searchbox", { name: "Buscar en la ayuda" }), "zzz");

    await expect.element(screen.getByText("Sin resultados")).toBeVisible();
    await expect.element(screen.getByText("Probá con otras palabras.")).toBeVisible();
    await expect.element(screen.getByRole("article")).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("opens and searches with no connection to the core or the cloud", async () => {
    const request = vi.spyOn(globalThis, "fetch");
    onTestFinished(() => request.mockRestore());
    const { screen } = await renderScreen();

    await userEvent.type(screen.getByRole("searchbox", { name: "Buscar en la ayuda" }), "lector");

    await expect.element(screen.getByText("Pasá el código por el lector.")).toBeVisible();
    expect(request).not.toHaveBeenCalled();
  });

  it("marks Ayuda as the current entry and links Inicio back to the start", async () => {
    const { screen } = await renderScreen();

    await expect
      .element(screen.getByRole("link", { name: "Ayuda" }))
      .toHaveAttribute("aria-current", "page");
    await expect
      .element(screen.getByRole("link", { name: "Historial" }))
      .not.toHaveAttribute("aria-current");
    await userEvent.click(screen.getByRole("link", { name: "Inicio" }));
    expect(screen.router.state.location.pathname).toBe("/");
  });

  it("asks for confirmation before signing out", async () => {
    const { screen, signOut } = await renderScreen();

    await userEvent.click(screen.getByRole("button", { name: "Salir" }));
    expect(signOut).not.toHaveBeenCalled();
    await userEvent.click(
      screen
        .getByRole("dialog", { name: "¿Salir de la caja?" })
        .getByRole("button", { name: "Salir" }),
    );

    expect(signOut).toHaveBeenCalledOnce();
  });
});
