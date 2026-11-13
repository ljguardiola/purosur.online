import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, onTestFinished, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { compraDeMiel } from "./test-support/purchases";
import {
  createServices,
  deferred,
  loaded,
  renderScreen,
  rowTexts,
} from "./test-support/purchases-list-screen";

beforeEach(async () => {
  window.history.pushState(null, "", "/");
  await page.viewport(1280, 800);
  onTestFinished(() => page.viewport(414, 896));
});

test("offers Registrar compra beside the filters and opens the new purchase page", async () => {
  const screen = await loaded(createServices());

  await userEvent.click(screen.getByRole("button", { name: "Registrar compra" }));

  await expect.poll(() => window.location.pathname).toBe("/purchases/new");
});

test("brings no heading or breadcrumb of its own, since the page frame writes them", async () => {
  const screen = await loaded(createServices());

  expect(screen.getByRole("heading", { level: 1 }).query()).toBeNull();
});

test("lists one row per purchase with its date, supplier, receipt and count of products", async () => {
  const screen = await loaded(createServices());

  await expect
    .poll(() => rowTexts(screen))
    .toEqual([
      "14/09/2026Distribuidora AndinaFactura B 0001-000012341",
      "10/09/2026Granos del ValleSin comprobante1",
    ]);
});

test("counts the products of a purchase with several lines", async () => {
  const [line] = compraDeMiel.lines;
  if (!line) {
    throw new Error("test setup: the purchase has no line");
  }
  const services = createServices();
  vi.mocked(services.fetchPurchases).mockResolvedValue({
    kind: "ok",
    value: [
      { ...compraDeMiel, lines: [line, { ...line, id: "second" }, { ...line, id: "third" }] },
    ],
  });
  const screen = await renderScreen(services);

  await expect
    .poll(() => rowTexts(screen))
    .toEqual(["14/09/2026Distribuidora AndinaFactura B 0001-000012343"]);
});

test("shows no line rows in the list, whose lines are in the purchase's panel", async () => {
  const screen = await loaded(createServices());

  expect(screen.getByText("Miel pura de abeja 1 kg").query()).toBeNull();
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

test("opens the own account panel when the purchases request comes back forbidden", async () => {
  window.history.pushState(null, "", "/purchases");
  const services = createServices();
  vi.mocked(services.fetchPurchases).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect
    .poll(() => window.location.pathname + window.location.search)
    .toBe("/?account=credentials");
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
