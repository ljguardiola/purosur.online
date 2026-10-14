import type { Freight } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { NewFreightModal, type NewFreightModalServices } from "./new-freight-modal";
import { fillFreight } from "./test-support/freight-form-fill";
import { compraAndina, compraMolinos, recordedEnvio } from "./test-support/freights";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function createServices(overrides: Partial<NewFreightModalServices> = {}): NewFreightModalServices {
  return {
    recordFreight: vi.fn<NewFreightModalServices["recordFreight"]>(),
    fetchLinkablePurchases: vi
      .fn<NewFreightModalServices["fetchLinkablePurchases"]>()
      .mockResolvedValue({ kind: "ok", value: [compraAndina, compraMolinos] }),
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

test("shows the eyebrow, the title, the fields and the purchases that may be linked", async () => {
  const screen = await renderModal();
  const dialog = await readyDialog(screen);

  await expect.element(dialog.getByText("Stock · Flete")).toBeVisible();
  await expect.element(dialog.getByRole("heading", { name: "Nuevo flete" })).toBeVisible();
  await expect.element(dialog.getByRole("group", { name: /^Fecha/ })).toBeVisible();
  await expect.element(dialog.getByRole("textbox", { name: /^Monto/ })).toBeVisible();
  await expect.element(dialog.getByRole("textbox", { name: /^Medio/ })).toBeVisible();
  await expect
    .element(dialog.getByRole("checkbox", { name: "Viaje propio (costo estimado)" }))
    .toBeVisible();
  await expect.element(dialog.getByRole("textbox", { name: /^Descripción/ })).toBeVisible();
  await expect.element(dialog.getByText("Compras vinculadas")).toBeVisible();
  await expect
    .element(dialog.getByText("12/09/2026 · Factura B 0003-00012845 · $ 168.680,00"))
    .toBeVisible();
  await expect
    .element(dialog.getByText("28/08/2026 · Remito 0001-00008812 · $ 64.900,00"))
    .toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "No cambia costos ni precios. Se reparte entre las líneas de estas compras y se muestra por unidad al decidir un precio.",
      ),
    )
    .toBeVisible();
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

test("records the store's own trip without asking for a carrier", async () => {
  const recordFreight = vi
    .fn<NewFreightModalServices["recordFreight"]>()
    .mockResolvedValue({ kind: "ok", freight: recordedEnvio });
  const screen = await renderModal({ services: createServices({ recordFreight }) });

  const dialog = await readyDialog(screen);
  await fillFreight(dialog, {
    date: "28082026",
    amount: "9000",
    ownTrip: true,
    description: "Retiro en el molino",
    suppliers: ["Molinos del Valle"],
  });
  await expect.element(dialog.getByRole("textbox", { name: /^Medio/ })).toBeDisabled();
  await userEvent.click(dialog.getByRole("button", { name: "Registrar el flete" }));

  await expect.poll(() => recordFreight.mock.calls).toHaveLength(1);
  expect(recordFreight).toHaveBeenCalledWith({
    date: "2026-08-28",
    amountCents: 900_000,
    description: "Retiro en el molino",
    means: { kind: "own_trip" },
    purchaseIds: [compraMolinos.id],
  });
});

test("refuses an empty form under each field without calling the cloud", async () => {
  const recordFreight = vi.fn<NewFreightModalServices["recordFreight"]>();
  const screen = await renderModal({ services: createServices({ recordFreight }) });

  const dialog = await readyDialog(screen);
  await userEvent.click(dialog.getByRole("button", { name: "Registrar el flete" }));

  await expect.element(dialog.getByText("Ingresá la fecha del flete.")).toBeVisible();
  await expect
    .element(dialog.getByText("Escribí el monto con coma para los centavos, por ejemplo 1.250,50."))
    .toBeVisible();
  await expect.element(dialog.getByText("Ingresá el medio del flete.")).toBeVisible();
  await expect.element(dialog.getByText("Ingresá la descripción del flete.")).toBeVisible();
  await expect.element(dialog.getByText("Elegí al menos una compra.")).toBeVisible();
  expect(recordFreight).not.toHaveBeenCalled();
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
  await expect
    .element(dialog.getByText("Elegí otras compras para repartir el flete."))
    .toBeVisible();
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
  await expect.element(dialog.getByText("Volvé a intentarlo.")).toBeVisible();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const recordFreight = vi.fn<NewFreightModalServices["recordFreight"]>().mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 60,
  });
  const screen = await renderModal({ services: createServices({ recordFreight }) });

  const dialog = await recordCompleteFreight(screen);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
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

test("offers to read the purchases again when they could not be loaded", async () => {
  const fetchLinkablePurchases = vi
    .fn<NewFreightModalServices["fetchLinkablePurchases"]>()
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValue({ kind: "ok", value: [compraAndina] });
  const screen = await renderModal({ services: createServices({ fetchLinkablePurchases }) });
  const dialog = screen.getByRole("dialog");

  await expect.element(dialog.getByText("No pudimos abrir las compras")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Registrar el flete" })).toBeDisabled();
  await userEvent.click(dialog.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(dialog.getByRole("checkbox", { name: "Distribuidora Andina" }))
    .toBeVisible();
});

test("says there is nothing to link when the period holds no purchase", async () => {
  const fetchLinkablePurchases = vi
    .fn<NewFreightModalServices["fetchLinkablePurchases"]>()
    .mockResolvedValue({ kind: "ok", value: [] });
  const screen = await renderModal({ services: createServices({ fetchLinkablePurchases }) });
  const dialog = screen.getByRole("dialog");

  await expect.element(dialog.getByText("No hay compras para vincular")).toBeVisible();
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
