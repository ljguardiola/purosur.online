import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { compraDeAceite, compraDeAvena, compraDeMiel } from "./test-support/purchases";
import {
  createServices,
  deferred,
  loaded,
  renderScreen,
  rowTexts,
} from "./test-support/purchases-list-screen";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

test("shows the breadcrumb and the heading", async () => {
  const screen = await loaded(createServices());

  await expect.element(screen.getByText("Stock").first()).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Compras", level: 1 })).toBeVisible();
});

test("lists each purchase with its date, supplier and receipt, followed by its lines", async () => {
  const screen = await loaded(createServices());

  await expect
    .poll(() => rowTexts(screen))
    .toEqual([
      "14/09/2026Distribuidora AndinaFactura B 0001-00001234",
      "Miel pura de abeja 1 kg2 × 12 u (24 u)$ 7.200,00 por paquete$ 600,00 por uCompra 03/11/202631/01/2027",
      "10/09/2026Granos del ValleSin comprobante",
      "Avena arrollada12,500 kg$ 2.000,00 por kg$ 2.000,00 por kgTécnico 07/10/2026",
    ]);
});

test("describes each line's product with its brand name and net content", async () => {
  const services = createServices();
  vi.mocked(services.fetchPurchases).mockResolvedValue({ kind: "ok", value: [compraDeAceite] });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Aceite de Almendras Vitora 30 ml")).toBeVisible();
});

test("writes a line's count of packages the way every amount reads", async () => {
  const [line] = compraDeMiel.lines;
  if (!line) {
    throw new Error("test setup: the purchase has no line");
  }
  const services = createServices();
  vi.mocked(services.fetchPurchases).mockResolvedValue({
    kind: "ok",
    value: [{ ...compraDeMiel, lines: [{ ...line, packages: 1_500, quantity: 18_000_000 }] }],
  });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("1.500 × 12 u (18.000 u)")).toBeVisible();
});

test("writes a line of a product sold by weight with each package's weight in kilos", async () => {
  const [line] = compraDeAvena.lines;
  if (!line) {
    throw new Error("test setup: the purchase has no line");
  }
  const services = createServices();
  vi.mocked(services.fetchPurchases).mockResolvedValue({
    kind: "ok",
    value: [
      {
        ...compraDeAvena,
        lines: [{ ...line, packages: 3, quantityPerPackage: 2_500, quantity: 7_500 }],
      },
    ],
  });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("3 × 2,500 kg (7,500 kg)")).toBeVisible();
});

test("shows the blank empty state when there are no purchases yet", async () => {
  const services = createServices();
  vi.mocked(services.fetchPurchases).mockResolvedValue({ kind: "ok", value: [] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Todavía no hay compras registradas")).toBeVisible();
});

test("shows a load error with a retry action that starts again from the loading placeholder", async () => {
  const services = createServices();
  const retry = deferred<Awaited<ReturnType<typeof services.fetchPurchases>>>();
  vi.mocked(services.fetchPurchases)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retry.promise);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir las compras")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByRole("table", { name: "Compras" }))
    .toHaveAttribute("aria-busy", "true");
  retry.resolve({ kind: "ok", value: [compraDeMiel] });
  await expect.element(screen.getByText("Distribuidora Andina")).toBeVisible();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const services = createServices();
  vi.mocked(services.fetchPurchases).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("navigates to Mi cuenta when the purchases request comes back forbidden", async () => {
  window.history.pushState(null, "", "/purchases");
  const services = createServices();
  vi.mocked(services.fetchPurchases).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("ends the session when the purchases request finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.fetchPurchases).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("the register action stays available while the purchases load and after they fail to load, and leads to the new purchase", async () => {
  window.history.pushState(null, "", "/purchases");
  const services = createServices();
  const firstLoad = deferred<Awaited<ReturnType<typeof services.fetchPurchases>>>();
  vi.mocked(services.fetchPurchases).mockReturnValueOnce(firstLoad.promise);
  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("button", { name: "Registrar compra" })).toBeEnabled();

  firstLoad.resolve({ kind: "failed" });
  await expect.element(screen.getByText("No pudimos abrir las compras")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Registrar compra" }));

  await expect.poll(() => window.location.pathname).toBe("/purchases/new");
});

test("confirms a purchase just registered, and reports when the notice goes away", async () => {
  const onNoticeDismissed = vi.fn();
  const screen = await loaded(createServices(), { registered: true, onNoticeDismissed });

  await expect.element(screen.getByText("Compra registrada")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

  expect(onNoticeDismissed).toHaveBeenCalledTimes(1);
});

test("shows no confirmation unless a purchase was just registered", async () => {
  const screen = await loaded(createServices());

  expect(screen.getByText("Compra registrada").query()).toBeNull();
});

test("has no accessibility violations once loaded", async () => {
  const screen = await loaded(createServices());

  await expectNoAccessibilityViolations(screen.container);
});
