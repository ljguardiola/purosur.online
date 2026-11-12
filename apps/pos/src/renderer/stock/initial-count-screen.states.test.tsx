import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  ALMENDRAS_LINE,
  FOUR_LINES,
  legendOf,
  PLACEHOLDER,
  QUESO_LINE,
  readOf,
  renderScreen,
  scan,
} from "./test-support/initial-count-screen";

function summaryRows(screen: Awaited<ReturnType<typeof renderScreen>>["screen"]) {
  return ["Productos distintos", "Con vencimiento", "Sin vencimiento"].map(
    (label) => screen.getByText(label, { exact: true }).element().nextElementSibling?.textContent,
  );
}

describe("InitialCountScreen states", () => {
  it("shows the screen's title as the header's third crumb and keeps its heading for screen readers only", async () => {
    const { screen } = await renderScreen();

    const header = screen.getByRole("region", { name: "Estado de la caja" });
    await expect.element(header).toHaveTextContent("CAJA 1•Ada•Inventario inicial");
    await expect.element(header).not.toHaveTextContent("Sin sesión abierta");
    const heading = screen.getByRole("heading", { level: 1, name: "Inventario inicial" });
    await expect.element(heading).toBeInTheDocument();
    expect(heading.element().getBoundingClientRect().width).toBeLessThanOrEqual(1);
    await expect.element(screen.getByText("Puesta en marcha")).not.toBeInTheDocument();
  });

  it("K1: shows the empty count, with the search field, the headed table and the panel at zero", async () => {
    const { screen, field } = await renderScreen();

    await expect.element(field).toHaveAttribute("placeholder", PLACEHOLDER);
    await expect.element(field).toBeEnabled();
    await expect.element(screen.getByRole("columnheader")).toHaveLength(3);
    await expect.element(screen.getByText("Todavía no cargaste ninguna línea")).toBeVisible();
    await expect
      .element(screen.getByText("Escaneá un producto o buscalo por nombre para cargar la primera."))
      .not.toBeInTheDocument();
    await expect.element(screen.getByText("Cargado hasta ahora")).toBeVisible();
    await expect.element(screen.getByText("0 líneas", { exact: true })).toBeVisible();
    expect(summaryRows(screen)).toEqual(["0", "0", "0"]);
    expect(legendOf()).toEqual([]);
    await expect.element(screen.getByRole("button", { name: "Quitar" })).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("K2: lists the lines with the first selected, totals them and offers ↑↓ Líneas and Supr Quitar", async () => {
    const { screen } = await renderScreen({
      readInitialCount: vi.fn(async () => readOf(FOUR_LINES)),
    });

    const rows = screen.getByRole("row");
    await expect.element(rows).toHaveLength(5);
    await expect
      .element(rows.nth(1))
      .toHaveTextContent("Almendras peladas— Sin vencimiento4,500 kg");
    await expect.element(rows.nth(3)).toHaveTextContent("Yerba mate 1 kg— Sin vencimiento24 u");
    await expect.element(rows.nth(4)).toHaveTextContent("Queso cremoso03/12/20264,400 kg");
    await expect.element(rows.nth(1)).toHaveAttribute("aria-current", "true");
    await expect.element(screen.getByText("4 líneas", { exact: true })).toBeVisible();
    expect(summaryRows(screen)).toEqual(["4", "1", "3"]);
    expect(legendOf()).toEqual(["↑↓Líneas", "SuprQuitar"]);
    await expectNoAccessibilityViolations(screen.container);
  });

  it("K3: marks the field red and tells inline, between the field and the table, that no product has the code", async () => {
    const { screen, field } = await renderScreen({
      readInitialCount: vi.fn(async () => readOf([ALMENDRAS_LINE])),
    });

    await scan(field, "7790000000123");

    const title = screen.getByText("No hay ningún producto con ese código");
    await expect.element(title).toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Buscalo por nombre. Si no aparece, falta darlo de alta en el backoffice.",
        ),
      )
      .toBeVisible();
    await expect.element(field).toHaveAttribute("aria-invalid", "true");
    const fieldBox = field.element().getBoundingClientRect();
    const noticeBox = title.element().getBoundingClientRect();
    const tableBox = screen.getByRole("table").element().getBoundingClientRect();
    expect(noticeBox.top).toBeGreaterThanOrEqual(fieldBox.bottom);
    expect(noticeBox.bottom).toBeLessThanOrEqual(tableBox.top);
    await expectNoAccessibilityViolations(screen.container);
  });

  it("K3: clears the red field and the notice when the text changes", async () => {
    const { screen, field } = await renderScreen();
    await scan(field, "7790000000123");
    await expect.element(screen.getByText("No hay ningún producto con ese código")).toBeVisible();

    await userEvent.type(field, "4");

    await expect
      .element(screen.getByText("No hay ningún producto con ese código"))
      .not.toBeInTheDocument();
    await expect.element(field).not.toHaveAttribute("aria-invalid", "true");
  });

  it("K6: tells that the line was not withdrawn, keeping the lines and the first selected", async () => {
    const { screen } = await renderScreen({
      readInitialCount: vi.fn(async () => readOf(FOUR_LINES)),
      withdrawInitialCountLine: vi.fn(async () => ({ kind: "unavailable" as const })),
    });
    await expect.element(screen.getByRole("row").nth(1)).toHaveAttribute("aria-current", "true");

    await userEvent.keyboard("{Delete}");

    const title = screen.getByText("No se pudo quitar la línea");
    await expect.element(title).toBeVisible();
    await expect.element(screen.getByText("Volvé a intentarlo en unos segundos.")).toBeVisible();
    await expect.element(screen.getByRole("row")).toHaveLength(5);
    await expect.element(screen.getByRole("row").nth(1)).toHaveAttribute("aria-current", "true");
    await expect.element(screen.getByRole("button", { name: "Terminar la carga" })).toBeVisible();
  });

  it("K7: disables the empty search field and tells the count is no longer offered, with the way home in the panel", async () => {
    const { screen, field } = await renderScreen({
      readInitialCount: vi.fn(async () => readOf([QUESO_LINE], false)),
    });

    await expect.element(field).toBeDisabled();
    await expect.element(field).toHaveValue("");
    await expect.element(field).toHaveAttribute("placeholder", PLACEHOLDER);
    await expect.element(screen.getByRole("columnheader")).toHaveLength(3);
    await expect
      .element(screen.getByText("La carga del inventario inicial ya no está disponible"))
      .toBeVisible();
    await expect
      .element(screen.getByRole("cell", { name: "Queso cremoso" }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("heading", { level: 2, name: "Inventario inicial" }))
      .toBeVisible();
    const back = screen.getByRole("button", { name: "Volver al inicio" });
    expect(back.element().querySelector("kbd")?.textContent).toBe("Enter");
    await expect.element(screen.getByText("Cargado hasta ahora")).not.toBeInTheDocument();
    expect(legendOf()).toEqual([]);
    await expectNoAccessibilityViolations(screen.container);
  });

  it("K8: tells, over the same headed table, that the person has no permission", async () => {
    const { screen, field } = await renderScreen({
      readInitialCount: vi.fn(async () => ({ kind: "not_permitted" as const })),
    });

    await expect.element(field).toBeDisabled();
    await expect
      .element(screen.getByText("No tenés permiso para cargar el inventario inicial"))
      .toBeVisible();
    await expect.element(screen.getByRole("columnheader")).toHaveLength(3);
    await expect.element(screen.getByRole("button", { name: "Volver al inicio" })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("tells, in the same place, that the session ended", async () => {
    const { screen, field } = await renderScreen({
      readInitialCount: vi.fn(async () => ({ kind: "not_signed_in" as const })),
    });

    await expect.element(field).toBeDisabled();
    await expect
      .element(
        screen.getByText("La sesión terminó. Volvé a ingresar para cargar el inventario inicial"),
      )
      .toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Volver al inicio" })).toBeVisible();
  });

  it("keeps the other problems of the lookup as a notice floating under the field", async () => {
    const { screen, field } = await renderScreen({
      findCountableProduct: vi.fn(async () => ({ kind: "unavailable" as const })),
    });

    await scan(field, "7790000000123");

    await expect
      .element(screen.getByText("No se pudo buscar el producto. Probá de nuevo."))
      .toBeVisible();
    await expect.element(field).not.toHaveAttribute("aria-invalid", "true");
  });
});
