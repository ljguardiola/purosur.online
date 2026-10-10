import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { PurchasesListScreen } from "./purchases-list-screen";
import type { PurchasesListScreenServices } from "./purchases-list-services";
import { compraDeAvena, compraDeMiel } from "./test-support/purchases";

afterEach(() => {
  window.history.pushState(null, "", "/");
});

function createServices(
  overrides: Partial<PurchasesListScreenServices> = {},
): PurchasesListScreenServices {
  return { fetchPurchases: vi.fn(), ...overrides };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function screenElement(
  services: PurchasesListScreenServices,
  {
    onSessionEnded = () => {},
    registered = false,
    onNoticeDismissed = () => {},
  }: { onSessionEnded?: () => void; registered?: boolean; onNoticeDismissed?: () => void } = {},
) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <PurchasesListScreen
          services={services}
          onSessionEnded={onSessionEnded}
          registered={registered}
          onNoticeDismissed={onNoticeDismissed}
        />
      </main>
    </FieldSizeProvider>
  );
}

function renderScreen(...args: Parameters<typeof screenElement>) {
  return render(screenElement(...args));
}

type Screen = Awaited<ReturnType<typeof renderScreen>>;

function rowTexts(screen: Screen): string[] {
  return screen
    .getByRole("row")
    .all()
    .slice(1)
    .map((row) => row.element().textContent ?? "");
}

async function loaded(
  services: PurchasesListScreenServices,
  options: Parameters<typeof screenElement>[1] = {},
) {
  vi.mocked(services.fetchPurchases).mockResolvedValue({
    kind: "ok",
    value: [compraDeMiel, compraDeAvena],
  });
  const screen = await renderScreen(services, options);
  await expect.element(screen.getByRole("table", { name: "Compras" })).toBeVisible();
  return screen;
}

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
      "Miel pura de abeja 1 kg2 × Caja x 12 (24 u)$ 7.200,00 por Caja x 12$ 600,00 por uL-1731/01/2027",
      "10/09/2026Granos del ValleSin comprobante",
      "Avena arrollada12,500 kg$ 2.000,00 por kg$ 2.000,00 por kg",
    ]);
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
