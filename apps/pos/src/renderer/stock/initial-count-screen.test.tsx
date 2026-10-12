import type { ReadInitialCountOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  deferred,
  PLACEHOLDER,
  QUESO_LINE,
  readOf,
  renderScreen,
  YERBA_LINE,
} from "./test-support/initial-count-screen";

describe("InitialCountScreen", () => {
  it("is titled Inventario inicial, names the start-up without a cash session, and offers the way home", async () => {
    const { screen, field } = await renderScreen();

    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Inventario inicial" }))
      .toBeVisible();
    await expect.element(screen.getByText("Puesta en marcha · Sin sesión de caja")).toBeVisible();
    await expect.element(screen.getByRole("link", { name: "Inicio" })).toBeVisible();
    await expect.element(field).toHaveAttribute("placeholder", PLACEHOLDER);
    await expectNoAccessibilityViolations(screen.container);
  });

  it("holds the places of the lines and of the totals while the count is read", async () => {
    const read = deferred<ReadInitialCountOutcome>();
    const { screen } = await renderScreen({ readInitialCount: vi.fn(() => read.promise) });

    await expect.element(screen.getByRole("table")).toBeVisible();
    await expect
      .element(screen.getByText("Todavía no cargaste ninguna línea"))
      .not.toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "Terminar la carga" })).toBeEnabled();
  });

  it("tells that no line has been counted yet and totals nothing", async () => {
    const { screen } = await renderScreen();

    await expect.element(screen.getByText("Todavía no cargaste ninguna línea")).toBeVisible();
    await expect.element(screen.getByText("0 líneas", { exact: true }).first()).toBeVisible();
  });

  it("lists the lines already counted and totals them", async () => {
    const { screen } = await renderScreen({
      readInitialCount: vi.fn(async () => readOf([QUESO_LINE, YERBA_LINE])),
    });

    await expect.element(screen.getByRole("cell", { name: "Queso cremoso" })).toBeVisible();
    await expect.element(screen.getByRole("cell", { name: "Yerba mate 1 kg" })).toBeVisible();
    await expect.element(screen.getByText("Cargado hasta ahora")).toBeVisible();
    await expect.element(screen.getByText("Productos distintos")).toBeVisible();
  });

  it("offers to read the count again when it could not be read, starting from the placeholders", async () => {
    const readInitialCount = vi
      .fn<() => Promise<ReadInitialCountOutcome>>()
      .mockResolvedValueOnce({ kind: "unavailable" })
      .mockResolvedValueOnce(readOf([QUESO_LINE]));
    const { screen } = await renderScreen({ readInitialCount });

    await expect.element(screen.getByText("No se pudo leer lo cargado")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await expect.element(screen.getByRole("cell", { name: "Queso cremoso" })).toBeVisible();
    expect(readInitialCount).toHaveBeenCalledTimes(2);
  });

  it("tells the person has no permission to load the count", async () => {
    const { screen } = await renderScreen({
      readInitialCount: vi.fn(async () => ({ kind: "not_permitted" as const })),
    });

    await expect
      .element(screen.getByText("No tenés permiso para cargar el inventario inicial"))
      .toBeVisible();
    await expect
      .element(screen.getByRole("combobox", { name: "Producto" }))
      .not.toBeInTheDocument();
  });

  it("tells the session ended when the core does not know who is signed in", async () => {
    const { screen } = await renderScreen({
      readInitialCount: vi.fn(async () => ({ kind: "not_signed_in" as const })),
    });

    await expect
      .element(
        screen.getByText("La sesión terminó. Volvé a ingresar para cargar el inventario inicial"),
      )
      .toBeVisible();
  });

  it("tells the count is no longer offered and goes back home", async () => {
    const { screen } = await renderScreen({
      readInitialCount: vi.fn(async () => readOf([QUESO_LINE], false)),
    });
    await screen.router.navigate({ to: "/initial-count" });

    await expect
      .element(screen.getByText("La carga del inventario inicial ya no está disponible"))
      .toBeVisible();
    await expect
      .element(screen.getByRole("combobox", { name: "Producto" }))
      .not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Volver al inicio" }));

    await expect.poll(() => screen.router.state.location.pathname).toBe("/");
  });

  it("closes the screen and goes home when the count is finished", async () => {
    const { screen } = await renderScreen({
      readInitialCount: vi.fn(async () => readOf([QUESO_LINE])),
    });
    await screen.router.navigate({ to: "/initial-count" });
    await expect.poll(() => screen.router.state.location.pathname).toBe("/initial-count");

    await userEvent.click(screen.getByRole("button", { name: "Terminar la carga" }));

    await expect.poll(() => screen.router.state.location.pathname).toBe("/");
  });
});
