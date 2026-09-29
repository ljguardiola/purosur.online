import { PERMISSION_CATALOG, type PermissionKey } from "@purosur/domain";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { CloudData } from "../platform/use-cloud-query";
import { render } from "../shell/test-support/render-with-router";
import { RegisterCoverageNotice } from "./register-coverage-notice";

const TITLE = "Hay acciones de la caja que nadie del local puede hacer";
const HINT = "Para cubrirlas, sumá el permiso a un rol con usuarios activos del local.";

function noticeFor(coverage: CloudData<PermissionKey[]>) {
  return render(
    <main>
      <RegisterCoverageNotice coverage={coverage} />
    </main>,
  );
}

function loaded(uncovered: PermissionKey[]): CloudData<PermissionKey[]> {
  return { status: "loaded", value: uncovered, refreshing: false };
}

test("lists each action nobody can do on its own line, then how to cover them", async () => {
  const screen = await noticeFor(loaded(["void_sale", "correct_register_clock"]));

  await expect.element(screen.getByText(TITLE)).toBeVisible();
  const description = screen.getByText(/^Nadie puede anular ventas\./).element();
  expect(description.textContent).toBe(
    `Nadie puede anular ventas.\nNadie puede corregir el reloj de la caja.\n${HINT}`,
  );
});

test("names every register action with its own sentence", async () => {
  const registerPermissions = PERMISSION_CATALOG.filter(
    (definition) => definition.registerMarker !== "none",
  ).map((definition) => definition.key);

  const screen = await noticeFor(loaded(registerPermissions));

  const lines = (screen.getByText(/^Nadie puede /).element().textContent ?? "").split("\n");
  expect(lines).toEqual([
    "Nadie puede vender y cobrar.",
    "Nadie puede consultar el historial de ventas.",
    "Nadie puede cerrar la sesión de caja de otra persona.",
    "Nadie puede reimprimir tickets.",
    "Nadie puede registrar ingresos de efectivo.",
    "Nadie puede registrar gastos pagados en efectivo.",
    "Nadie puede retirar efectivo de la caja.",
    "Nadie puede cambiar el precio o aplicar un descuento a una línea.",
    "Nadie puede aplicar descuentos sobre el total.",
    "Nadie puede anular ventas.",
    "Nadie puede hacer devoluciones.",
    "Nadie puede autorizar el reembolso de un defecto fuera de plazo.",
    "Nadie puede confirmar reembolsos.",
    "Nadie puede cargar el inventario inicial.",
    "Nadie puede corregir el reloj de la caja.",
    HINT,
  ]);
});

test("shows nothing when every register action is covered", async () => {
  const screen = await noticeFor(loaded([]));

  expect(screen.container.querySelector("main")?.childElementCount).toBe(0);
});

test("keeps showing the actions already read while they are read again", async () => {
  const screen = await noticeFor({ status: "loaded", value: ["void_sale"], refreshing: true });

  await expect.element(screen.getByText(TITLE)).toBeVisible();
});

test("shows a placeholder while the coverage loads", async () => {
  const screen = await noticeFor({ status: "loading" });

  await expect.element(screen.getByText("Cargando…")).toHaveTextContent("Cargando…");
  await expect.element(screen.getByText(TITLE)).not.toBeInTheDocument();
});

test("shows a load failure whose Reintentar reads the coverage again", async () => {
  const retry = vi.fn();
  const screen = await noticeFor({ status: "failed", retry });

  await expect
    .element(screen.getByText("No pudimos abrir las acciones de la caja sin cubrir"))
    .toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  expect(retry).toHaveBeenCalledOnce();
});

test("shows how long to wait when the coverage read was rate limited", async () => {
  const screen = await noticeFor({ status: "failed", retry: () => {}, retryAfterSeconds: 120 });

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeInTheDocument();
});
