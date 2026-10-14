import type { Freight } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { NewFreightModal, type NewFreightModalServices } from "./new-freight-modal";
import { fillFreight } from "./test-support/freight-form-fill";
import {
  compraAndina,
  compraMolinos,
  linkablePurchases,
  recordedEnvio,
} from "./test-support/freights";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function createServices(overrides: Partial<NewFreightModalServices> = {}): NewFreightModalServices {
  return {
    recordFreight: vi.fn<NewFreightModalServices["recordFreight"]>(),
    fetchLinkablePurchases: vi
      .fn<NewFreightModalServices["fetchLinkablePurchases"]>()
      .mockResolvedValue({ kind: "ok", value: linkablePurchases }),
    ...overrides,
  };
}

type ModalOptions = {
  services?: NewFreightModalServices;
  period?: 30 | 90 | 365;
  open?: boolean;
  onRecorded?: (freight: Freight) => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
};

function modalElement({
  services = createServices(),
  period = 90,
  open = true,
  onRecorded = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: ModalOptions = {}) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <NewFreightModal
          open={open}
          period={period}
          services={services}
          onRecorded={onRecorded}
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

type ModalScreen = Awaited<ReturnType<typeof renderModal>>;

async function readyDialog(screen: ModalScreen) {
  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("checkbox", { name: "Distribuidora Andina" }))
    .toBeVisible();
  return dialog;
}

async function recordCompleteFreight(screen: ModalScreen) {
  const dialog = await readyDialog(screen);
  await fillFreight(dialog, {
    date: "12092026",
    amount: "18500,00",
    carrierName: "Expreso Sur",
    description: "Envío desde Buenos Aires",
    suppliers: ["Distribuidora Andina", "Molinos del Valle"],
  });
  await userEvent.click(dialog.getByRole("button", { name: "Registrar el flete" }));
  return dialog;
}

test("shows the eyebrow and the title over the freight's form", async () => {
  const screen = await renderModal();
  const dialog = await readyDialog(screen);

  await expect.element(dialog.getByText("Stock · Flete")).toBeVisible();
  await expect.element(dialog.getByRole("heading", { name: "Nuevo flete" })).toBeVisible();
  await expect.element(dialog.getByRole("textbox", { name: /^Descripción/ })).toBeVisible();
});

function dateSegments(dialog: Awaited<ReturnType<typeof readyDialog>>) {
  return dialog
    .getByRole("group", { name: /^Fecha/ })
    .getByRole("spinbutton")
    .all()
    .map((segment) => segment.element().textContent);
}

test("opens dated the day the cloud answers as today", async () => {
  const screen = await renderModal();
  const dialog = await readyDialog(screen);

  await expect.poll(() => dateSegments(dialog)).toEqual(["16", "9", "2026"]);
});

test("keeps the date the person chose when the cloud later answers another day", async () => {
  const fetchLinkablePurchases = vi
    .fn<NewFreightModalServices["fetchLinkablePurchases"]>()
    .mockResolvedValueOnce({ kind: "ok", value: linkablePurchases })
    .mockResolvedValue({ kind: "ok", value: { ...linkablePurchases, today: "2026-09-17" } });
  const recordFreight = vi
    .fn<NewFreightModalServices["recordFreight"]>()
    .mockResolvedValue({ kind: "purchase_not_found" });
  const screen = await renderModal({
    services: createServices({ fetchLinkablePurchases, recordFreight }),
  });

  const dialog = await recordCompleteFreight(screen);

  await expect.poll(() => fetchLinkablePurchases.mock.calls.length).toBe(2);
  await expect
    .element(dialog.getByText("Alguna de las compras ya no está disponible. Elegí otras."))
    .toBeVisible();
  expect(dateSegments(dialog)).toEqual(["12", "9", "2026"]);
});

test("reads the purchases of the period the list shows, and nothing while closed", async () => {
  const services = createServices();
  const screen = await renderModal({ services, period: 30, open: false });
  expect(services.fetchLinkablePurchases).not.toHaveBeenCalled();
  await screen.rerender(modalElement({ services, period: 30 }));

  await expect
    .poll(() => vi.mocked(services.fetchLinkablePurchases).mock.calls)
    .toEqual([[{ period: 30 }]]);
});

test("records the freight with its texts trimmed and the chosen purchases, and hands it over", async () => {
  const recordFreight = vi
    .fn<NewFreightModalServices["recordFreight"]>()
    .mockResolvedValue({ kind: "ok", freight: recordedEnvio });
  const onRecorded = vi.fn();
  const screen = await renderModal({ services: createServices({ recordFreight }), onRecorded });

  const dialog = await readyDialog(screen);
  await fillFreight(dialog, {
    date: "12092026",
    amount: "18.500,00",
    carrierName: "  Expreso Sur ",
    description: " Envío desde Buenos Aires ",
    suppliers: ["Distribuidora Andina", "Molinos del Valle"],
  });
  await userEvent.click(dialog.getByRole("button", { name: "Registrar el flete" }));

  await expect.poll(() => onRecorded.mock.calls).toEqual([[recordedEnvio]]);
  expect(recordFreight).toHaveBeenCalledWith({
    date: "2026-09-12",
    amountCents: 1_850_000,
    description: "Envío desde Buenos Aires",
    means: { kind: "carrier", name: "Expreso Sur" },
    purchaseIds: [compraAndina.id, compraMolinos.id],
  });
});

test("shows a field the cloud refused under that field", async () => {
  const recordFreight = vi
    .fn<NewFreightModalServices["recordFreight"]>()
    .mockResolvedValue({ kind: "validation_failed", field: "date" });
  const screen = await renderModal({ services: createServices({ recordFreight }) });

  const dialog = await recordCompleteFreight(screen);

  await expect
    .element(dialog.getByText("La fecha del flete no puede ser posterior a hoy."))
    .toBeVisible();
});

test("says the linked purchases are worth nothing to distribute the freight over", async () => {
  const recordFreight = vi
    .fn<NewFreightModalServices["recordFreight"]>()
    .mockResolvedValue({ kind: "purchases_without_value" });
  const screen = await renderModal({ services: createServices({ recordFreight }) });

  const dialog = await recordCompleteFreight(screen);

  await expect.element(dialog.getByText("Las compras vinculadas no tienen valor")).toBeVisible();
});

test("asks again for the purchases when one of them is gone", async () => {
  const recordFreight = vi
    .fn<NewFreightModalServices["recordFreight"]>()
    .mockResolvedValue({ kind: "purchase_not_found" });
  const services = createServices({ recordFreight });
  const screen = await renderModal({ services });

  const dialog = await recordCompleteFreight(screen);

  await expect
    .element(dialog.getByText("Alguna de las compras ya no está disponible. Elegí otras."))
    .toBeVisible();
  await expect.poll(() => vi.mocked(services.fetchLinkablePurchases).mock.calls.length).toBe(2);
});

test("shows the failure notice", async () => {
  const recordFreight = vi
    .fn<NewFreightModalServices["recordFreight"]>()
    .mockResolvedValue({ kind: "failed" });
  const screen = await renderModal({ services: createServices({ recordFreight }) });

  const dialog = await recordCompleteFreight(screen);

  await expect.element(dialog.getByText("No se registró el flete")).toBeVisible();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const recordFreight = vi.fn<NewFreightModalServices["recordFreight"]>().mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 60,
  });
  const screen = await renderModal({ services: createServices({ recordFreight }) });

  const dialog = await recordCompleteFreight(screen);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
});

test("ends the session when recording finds no open session", async () => {
  const recordFreight = vi
    .fn<NewFreightModalServices["recordFreight"]>()
    .mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ services: createServices({ recordFreight }), onSessionEnded });

  await recordCompleteFreight(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when recording comes back forbidden", async () => {
  window.history.pushState(null, "", "/freights");
  const recordFreight = vi
    .fn<NewFreightModalServices["recordFreight"]>()
    .mockResolvedValue({ kind: "forbidden" });
  const screen = await renderModal({ services: createServices({ recordFreight }) });

  await recordCompleteFreight(screen);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("holds the registration until the purchases have loaded", async () => {
  const fetchLinkablePurchases = vi
    .fn<NewFreightModalServices["fetchLinkablePurchases"]>()
    .mockReturnValue(new Promise(() => {}));
  const screen = await renderModal({ services: createServices({ fetchLinkablePurchases }) });

  const dialog = screen.getByRole("dialog");

  await expect.element(dialog.getByRole("button", { name: "Registrar el flete" })).toBeDisabled();
});

test("holds the registration after the purchases could not be loaded", async () => {
  const fetchLinkablePurchases = vi
    .fn<NewFreightModalServices["fetchLinkablePurchases"]>()
    .mockResolvedValue({ kind: "failed" });
  const screen = await renderModal({ services: createServices({ fetchLinkablePurchases }) });
  const dialog = screen.getByRole("dialog");

  await expect.element(dialog.getByText("No pudimos abrir las compras")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Registrar el flete" })).toBeDisabled();
});

test("starts empty every time it opens", async () => {
  const services = createServices();
  const screen = await renderModal({ services });
  const dialog = await readyDialog(screen);
  await fillFreight(dialog, { description: "Algo", suppliers: ["Distribuidora Andina"] });

  await screen.rerender(modalElement({ services, period: 90, open: false }));
  await screen.rerender(modalElement({ services, period: 90 }));

  const reopened = await readyDialog(screen);
  await expect.element(reopened.getByRole("textbox", { name: /^Descripción/ })).toHaveValue("");
  await expect
    .element(reopened.getByRole("checkbox", { name: "Distribuidora Andina" }))
    .not.toBeChecked();
});

test("cancel closes the modal without calling the cloud", async () => {
  const recordFreight = vi.fn<NewFreightModalServices["recordFreight"]>();
  const onClose = vi.fn();
  const screen = await renderModal({ services: createServices({ recordFreight }), onClose });

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(recordFreight).not.toHaveBeenCalled();
});

test("has no accessibility violations", async () => {
  const screen = await renderModal();
  await readyDialog(screen);

  await expectNoAccessibilityViolations(screen.getByRole("dialog").element());
});
