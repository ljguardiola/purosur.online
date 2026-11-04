import type { PurchaseChange, PurchaseSummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { PurchaseChangesModal, type PurchaseChangesModalServices } from "./purchase-changes-modal";
import {
  compraDeMielCorregida,
  headerCorrection,
  lineExpiryCorrection,
  linesAdded,
} from "./test-support/purchase-changes";
import { compraDeAvena } from "./test-support/purchases";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function createServices(
  changes: PurchaseChange[] = [lineExpiryCorrection, linesAdded, headerCorrection],
): PurchaseChangesModalServices {
  return {
    fetchPurchaseChanges: vi
      .fn<PurchaseChangesModalServices["fetchPurchaseChanges"]>()
      .mockResolvedValue({ kind: "ok", value: changes }),
  };
}

type ModalOptions = {
  target?: PurchaseSummary | null;
  services?: PurchaseChangesModalServices;
  onClose?: () => void;
  onSessionEnded?: () => void;
};

function modalElement({
  target = compraDeMielCorregida,
  services = createServices(),
  onClose = () => {},
  onSessionEnded = () => {},
}: ModalOptions = {}) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <PurchaseChangesModal
          target={target}
          services={services}
          onClose={onClose}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>
  );
}

function renderModal(options: ModalOptions = {}) {
  return render(modalElement(options));
}

test("names the purchase whose changes it lists", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");

  await expect.element(dialog.getByText("Stock · Compra · Distribuidora Andina")).toBeVisible();
  await expect.element(dialog.getByRole("heading", { name: "Cambios de la compra" })).toBeVisible();
});

test("reads the changes of the purchase only once it is open", async () => {
  const services = createServices();
  const screen = await renderModal({ target: null, services });

  expect(services.fetchPurchaseChanges).not.toHaveBeenCalled();

  await screen.rerender(modalElement({ services }));

  await expect
    .poll(() => vi.mocked(services.fetchPurchaseChanges).mock.calls)
    .toEqual([[compraDeMielCorregida.id]]);
});

test("reads the changes of the purchase it opens for each time", async () => {
  const services = createServices();
  const screen = await renderModal({ services });
  await expect.element(screen.getByRole("dialog").getByText("Marta Quiroga").first()).toBeVisible();

  await screen.rerender(modalElement({ services, target: compraDeAvena }));

  await expect
    .poll(() => vi.mocked(services.fetchPurchaseChanges).mock.calls)
    .toEqual([[compraDeMielCorregida.id], [compraDeAvena.id]]);
});

test("shows the loading placeholder while the changes load", async () => {
  const changes =
    deferred<Awaited<ReturnType<PurchaseChangesModalServices["fetchPurchaseChanges"]>>>();
  const services: PurchaseChangesModalServices = {
    fetchPurchaseChanges: vi
      .fn<PurchaseChangesModalServices["fetchPurchaseChanges"]>()
      .mockReturnValue(changes.promise),
  };
  const screen = await renderModal({ services });

  await expect
    .element(screen.getByRole("dialog").getByRole("table", { name: "Cambios" }))
    .toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("dialog").getByText("Sin cambios").query()).toBeNull();

  changes.resolve({ kind: "ok", value: [headerCorrection] });
  await expect.element(screen.getByRole("dialog").getByText("Marta Quiroga")).toBeVisible();
});

test("says there are no changes when the purchase was never corrected", async () => {
  const screen = await renderModal({ services: createServices([]) });

  await expect.element(screen.getByRole("dialog").getByText("Sin cambios")).toBeVisible();
});

test("shows a load error with a retry action", async () => {
  const fetchPurchaseChanges = vi
    .fn<PurchaseChangesModalServices["fetchPurchaseChanges"]>()
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValue({ kind: "ok", value: [headerCorrection] });
  const screen = await renderModal({ services: { fetchPurchaseChanges } });
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByText("No pudimos abrir los cambios")).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Reintentar" }));

  await expect.element(dialog.getByText("Marta Quiroga")).toBeVisible();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const fetchPurchaseChanges = vi
    .fn<PurchaseChangesModalServices["fetchPurchaseChanges"]>()
    .mockResolvedValue({ kind: "rate_limited", retryAfterSeconds: 120 });
  const screen = await renderModal({ services: { fetchPurchaseChanges } });

  await expect
    .element(screen.getByRole("dialog").getByText("Demasiadas solicitudes"))
    .toBeVisible();
});

test("ends the session when the changes come back without an open session", async () => {
  const fetchPurchaseChanges = vi
    .fn<PurchaseChangesModalServices["fetchPurchaseChanges"]>()
    .mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderModal({ services: { fetchPurchaseChanges }, onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when the changes come back forbidden", async () => {
  window.history.pushState(null, "", "/purchases");
  const fetchPurchaseChanges = vi
    .fn<PurchaseChangesModalServices["fetchPurchaseChanges"]>()
    .mockResolvedValue({ kind: "forbidden" });

  await renderModal({ services: { fetchPurchaseChanges } });

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("lists who corrected the purchase and when, in the store's time zone, newest first", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");

  await expect.element(dialog.getByText("16/09/2026 · 06:00")).toBeVisible();
  await expect.element(dialog.getByText("15/09/2026 · 13:30")).toBeVisible();
  await expect.element(dialog.getByText("15/09/2026 · 11:05")).toBeVisible();
  const moments = dialog.getByText(/^\d\d\/\d\d\/\d{4} · \d\d:\d\d$/).all();
  expect(moments.map((moment) => moment.element().textContent)).toEqual([
    "16/09/2026 · 06:00",
    "15/09/2026 · 13:30",
    "15/09/2026 · 11:05",
  ]);
  await expect.element(dialog.getByText("Julián Paz")).toBeVisible();
});

test("shows each corrected header field with its previous and new value", async () => {
  const screen = await renderModal({ services: createServices([headerCorrection]) });
  const dialog = screen.getByRole("dialog");

  await expect.element(dialog.getByText("14/09/2026 → 13/09/2026")).toBeVisible();
  await expect.element(dialog.getByText("Factura B → Remito")).toBeVisible();
  await expect.element(dialog.getByText("0001-00001234 → 0001-00001243")).toBeVisible();
  await expect.element(dialog.getByText("Sin nota → Llegó a la mañana")).toBeVisible();
});

test("shows an added line with the product found in the purchase, its quantity and cost", async () => {
  const screen = await renderModal({ services: createServices([linesAdded]) });

  await expect
    .element(screen.getByRole("dialog").getByText("Avena arrollada · 10,000 kg · $ 1.800,00"))
    .toBeVisible();
});

test("shows a corrected expiry with the product of its line", async () => {
  const screen = await renderModal({ services: createServices([lineExpiryCorrection]) });
  const dialog = screen.getByRole("dialog");

  await expect.element(dialog.getByText("Vencimiento de Miel pura de abeja 1 kg")).toBeVisible();
  await expect.element(dialog.getByText("31/01/2027 → Sin vencimiento")).toBeVisible();
});

test("close hands the closing over", async () => {
  const onClose = vi.fn();
  const screen = await renderModal({ onClose });
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByText("Marta Quiroga").first()).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Cerrar" }).last());

  expect(onClose).toHaveBeenCalled();
});

test("opens nothing without a purchase", async () => {
  const screen = await renderModal({ target: null });

  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("has no accessibility violations", async () => {
  const screen = await renderModal({ services: createServices([lineExpiryCorrection]) });
  await expect.element(screen.getByRole("dialog").getByText("Marta Quiroga").first()).toBeVisible();

  await expectNoAccessibilityViolations(screen.getByRole("dialog").element());
});

test("has no accessibility violations while several changes make its body scroll", async () => {
  const severalCorrections = Array.from(
    { length: 8 },
    (_, index): PurchaseChange => ({
      ...headerCorrection,
      id: `c0c00000-0000-4000-8000-0000000001${String(index).padStart(2, "0")}`,
    }),
  );
  const screen = await renderModal({
    services: createServices([lineExpiryCorrection, linesAdded, ...severalCorrections]),
  });
  await expect.element(screen.getByRole("dialog").getByText("Julián Paz").first()).toBeVisible();
  const body = screen.getByRole("region", { name: "Cambios de la compra" });

  await expect.element(body).toHaveAttribute("tabindex", "0");
  expect(body.element().scrollHeight).toBeGreaterThan(body.element().clientHeight);
  await expectNoAccessibilityViolations(screen.getByRole("dialog").element());
});
