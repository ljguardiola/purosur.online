import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { OUTDATED_TAB_ADVICE, openAsOutdatedTab } from "../platform/test-support/release-monitor";
import { render } from "../shell/test-support/render-with-router";
import {
  SharePurchaseOrderModal,
  type SharePurchaseOrderModalServices,
} from "./share-purchase-order-modal";
import { DRAFT_ORDER, SENT_ORDER } from "./test-support/purchase-orders";

const ORDER_TEXT = "Pedido a Distribuidora Andina\n3 x Miel pura de abeja 1 kg";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createServices(
  overrides: Partial<SharePurchaseOrderModalServices> = {},
): SharePurchaseOrderModalServices {
  return {
    fetchPurchaseOrderText: vi
      .fn<SharePurchaseOrderModalServices["fetchPurchaseOrderText"]>()
      .mockResolvedValue({ kind: "ok", value: { kind: "found", text: ORDER_TEXT } }),
    fetchPurchaseOrderPdf: vi.fn<SharePurchaseOrderModalServices["fetchPurchaseOrderPdf"]>(),
    sharePurchaseOrder: vi.fn<SharePurchaseOrderModalServices["sharePurchaseOrder"]>(),
    ...overrides,
  };
}

async function renderModal(
  services: SharePurchaseOrderModalServices,
  {
    target = DRAFT_ORDER,
    onShared = () => {},
    onOutdated = () => {},
    onClose = () => {},
    onSessionEnded = () => {},
  }: {
    target?: typeof DRAFT_ORDER;
    onShared?: (order: typeof SENT_ORDER) => void;
    onOutdated?: () => void;
    onClose?: () => void;
    onSessionEnded?: () => void;
  } = {},
) {
  const screen = await render(
    <main>
      <SharePurchaseOrderModal
        target={target}
        services={services}
        onShared={onShared}
        onOutdated={onOutdated}
        onClose={onClose}
        onSessionEnded={onSessionEnded}
      />
    </main>,
  );
  return screen.getByRole("dialog");
}

test("shows the order text the cloud answers and says the branch sends it itself", async () => {
  const services = createServices();
  const dialog = await renderModal(services);

  await expect.element(dialog.getByRole("heading", { name: "Compartir pedido" })).toBeVisible();
  await expect.element(dialog.getByText("Pedido a Distribuidora Andina").first()).toBeVisible();
  await expect.element(dialog.getByText("3 x Miel pura de abeja 1 kg")).toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "Enviáselo al proveedor por el canal que uses (WhatsApp, correo…). El sistema no lo envía.",
      ),
    )
    .toBeVisible();
  expect(services.fetchPurchaseOrderText).toHaveBeenCalledWith(DRAFT_ORDER.id);
});

test("offers no text action while the text has not loaded", async () => {
  const services = createServices({
    fetchPurchaseOrderText: vi.fn().mockReturnValue(new Promise(() => {})),
  });
  const dialog = await renderModal(services);

  await expect.element(dialog.getByRole("button", { name: "Copiar texto" })).toBeDisabled();
});

test("shows a load error with a retry that reads the text again", async () => {
  const fetchPurchaseOrderText = vi
    .fn<SharePurchaseOrderModalServices["fetchPurchaseOrderText"]>()
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValue({ kind: "ok", value: { kind: "found", text: ORDER_TEXT } });
  const dialog = await renderModal(createServices({ fetchPurchaseOrderText }));

  await expect.element(dialog.getByText("No pudimos abrir el texto del pedido")).toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Reintentar" }));

  await expect.element(dialog.getByText("3 x Miel pura de abeja 1 kg")).toBeVisible();
});

test("tells when the order no longer exists, and updating it reports it", async () => {
  const onOutdated = vi.fn();
  const dialog = await renderModal(
    createServices({
      fetchPurchaseOrderText: vi
        .fn()
        .mockResolvedValue({ kind: "ok", value: { kind: "not_found" } }),
    }),
    { onOutdated },
  );

  await expect.element(dialog.getByText("Este pedido ya no existe")).toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Actualizar el pedido" }));

  expect(onOutdated).toHaveBeenCalledTimes(1);
});

test("ends the session when the text comes back unauthenticated", async () => {
  const onSessionEnded = vi.fn();
  await renderModal(
    createServices({
      fetchPurchaseOrderText: vi.fn().mockResolvedValue({ kind: "unauthenticated" }),
    }),
    { onSessionEnded },
  );

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("copies the text and says it was copied", async () => {
  const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  const dialog = await renderModal(createServices());
  await expect.element(dialog.getByText("3 x Miel pura de abeja 1 kg")).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Copiar texto" }));

  expect(writeText).toHaveBeenCalledWith(ORDER_TEXT);
  await expect.element(dialog.getByText("Texto copiado")).toBeVisible();
});

test("says the text could not be copied when the browser refuses", async () => {
  vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
  const dialog = await renderModal(createServices());
  await expect.element(dialog.getByText("3 x Miel pura de abeja 1 kg")).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Copiar texto" }));

  await expect.element(dialog.getByText("No se pudo copiar el texto")).toBeVisible();
  expect(dialog.getByText("Texto copiado").query()).toBeNull();
});

test("downloads the PDF of the order as pedido.pdf and stays open", async () => {
  const services = createServices({
    fetchPurchaseOrderPdf: vi
      .fn<SharePurchaseOrderModalServices["fetchPurchaseOrderPdf"]>()
      .mockResolvedValue({ kind: "ok", blob: new Blob(["%PDF-1.7"], { type: "application/pdf" }) }),
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const downloadedFileNames: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloadedFileNames.push(this.download);
  });
  const onClose = vi.fn();
  const dialog = await renderModal(services, { onClose });

  await userEvent.click(dialog.getByRole("button", { name: "Descargar PDF" }));

  await expect.poll(() => downloadedFileNames).toEqual(["pedido.pdf"]);
  expect(services.fetchPurchaseOrderPdf).toHaveBeenCalledWith(DRAFT_ORDER.id);
  expect(onClose).not.toHaveBeenCalled();
});

test("shows the failure notice when the PDF cannot be generated", async () => {
  const dialog = await renderModal(
    createServices({ fetchPurchaseOrderPdf: vi.fn().mockResolvedValue({ kind: "failed" }) }),
  );

  await userEvent.click(dialog.getByRole("button", { name: "Descargar PDF" }));

  await expect.element(dialog.getByText("No se pudo generar el PDF")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Descargar PDF" })).toBeEnabled();
});

test("shows the time to wait when the cloud rate-limits the PDF", async () => {
  const dialog = await renderModal(
    createServices({
      fetchPurchaseOrderPdf: vi
        .fn()
        .mockResolvedValue({ kind: "rate_limited", retryAfterSeconds: 60 }),
    }),
  );

  await userEvent.click(dialog.getByRole("button", { name: "Descargar PDF" }));

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
});

test("tells when the order no longer exists if the PDF finds none", async () => {
  const onOutdated = vi.fn();
  const dialog = await renderModal(
    createServices({ fetchPurchaseOrderPdf: vi.fn().mockResolvedValue({ kind: "not_found" }) }),
    { onOutdated },
  );

  await userEvent.click(dialog.getByRole("button", { name: "Descargar PDF" }));
  await expect.element(dialog.getByText("Este pedido ya no existe")).toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Actualizar el pedido" }));

  expect(onOutdated).toHaveBeenCalledTimes(1);
});

test("ends the session when the PDF finds no open session", async () => {
  const onSessionEnded = vi.fn();
  const dialog = await renderModal(
    createServices({
      fetchPurchaseOrderPdf: vi.fn().mockResolvedValue({ kind: "unauthenticated" }),
    }),
    { onSessionEnded },
  );

  await userEvent.click(dialog.getByRole("button", { name: "Descargar PDF" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when the PDF comes back forbidden", async () => {
  window.history.pushState(null, "", "/purchase-orders");
  const dialog = await renderModal(
    createServices({ fetchPurchaseOrderPdf: vi.fn().mockResolvedValue({ kind: "forbidden" }) }),
  );

  await userEvent.click(dialog.getByRole("button", { name: "Descargar PDF" }));

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("marking as sent shares the order and reports the order as the cloud answered it", async () => {
  const services = createServices({
    sharePurchaseOrder: vi
      .fn<SharePurchaseOrderModalServices["sharePurchaseOrder"]>()
      .mockResolvedValue({ kind: "ok", order: SENT_ORDER }),
  });
  const onShared = vi.fn();
  const dialog = await renderModal(services, { onShared });

  await userEvent.click(dialog.getByRole("button", { name: "Marcar como enviado" }));

  expect(services.sharePurchaseOrder).toHaveBeenCalledWith(DRAFT_ORDER.id);
  await expect.poll(() => onShared.mock.calls[0]?.[0]).toEqual(SENT_ORDER);
});

test("offers to mark as sent only when the cloud answers the order is shareable", async () => {
  const dialog = await renderModal(createServices(), { target: SENT_ORDER });

  await expect.element(dialog.getByRole("button", { name: "Copiar texto" })).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Descargar PDF" })).toBeVisible();
  expect(dialog.getByRole("button", { name: "Marcar como enviado" }).query()).toBeNull();
});

test("tells when the order can no longer be sent, and updating it reports it", async () => {
  const onOutdated = vi.fn();
  const dialog = await renderModal(
    createServices({ sharePurchaseOrder: vi.fn().mockResolvedValue({ kind: "not_shareable" }) }),
    { onOutdated },
  );

  await userEvent.click(dialog.getByRole("button", { name: "Marcar como enviado" }));

  await expect
    .element(dialog.getByText("Este pedido ya no se puede marcar como enviado"))
    .toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Actualizar el pedido" }));
  expect(onOutdated).toHaveBeenCalledTimes(1);
});

test("shows the failure notice, and marking as sent stays available", async () => {
  const dialog = await renderModal(
    createServices({ sharePurchaseOrder: vi.fn().mockResolvedValue({ kind: "failed" }) }),
  );

  await userEvent.click(dialog.getByRole("button", { name: "Marcar como enviado" }));

  await expect.element(dialog.getByText("No se marcó el pedido como enviado")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Marcar como enviado" })).toBeEnabled();
});

test("tells an outdated tab to reload because the backoffice was updated when marking is refused", async () => {
  openAsOutdatedTab();
  const dialog = await renderModal(
    createServices({ sharePurchaseOrder: vi.fn().mockResolvedValue({ kind: "failed" }) }),
  );

  await userEvent.click(dialog.getByRole("button", { name: "Marcar como enviado" }));

  await expect.element(dialog.getByText(OUTDATED_TAB_ADVICE)).toBeVisible();
});

test("shows the time to wait when the cloud rate-limits the sharing", async () => {
  const dialog = await renderModal(
    createServices({
      sharePurchaseOrder: vi
        .fn()
        .mockResolvedValue({ kind: "rate_limited", retryAfterSeconds: 60 }),
    }),
  );

  await userEvent.click(dialog.getByRole("button", { name: "Marcar como enviado" }));

  await expect.element(dialog.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
});

test("ends the session when sharing finds no open session", async () => {
  const onSessionEnded = vi.fn();
  const dialog = await renderModal(
    createServices({ sharePurchaseOrder: vi.fn().mockResolvedValue({ kind: "unauthenticated" }) }),
    { onSessionEnded },
  );

  await userEvent.click(dialog.getByRole("button", { name: "Marcar como enviado" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when sharing comes back forbidden", async () => {
  window.history.pushState(null, "", "/purchase-orders");
  const dialog = await renderModal(
    createServices({ sharePurchaseOrder: vi.fn().mockResolvedValue({ kind: "forbidden" }) }),
  );

  await userEvent.click(dialog.getByRole("button", { name: "Marcar como enviado" }));

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("Cerrar closes the modal without calling the cloud to share", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const dialog = await renderModal(services, { onClose });

  await userEvent.click(dialog.getByRole("button", { name: "Cerrar" }).first());

  expect(onClose).toHaveBeenCalled();
  expect(services.sharePurchaseOrder).not.toHaveBeenCalled();
});
