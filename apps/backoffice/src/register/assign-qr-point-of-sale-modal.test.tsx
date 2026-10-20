import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { type Locator, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  AssignQrPointOfSaleModal,
  type AssignQrPointOfSaleModalServices,
} from "./assign-qr-point-of-sale-modal";
import type { RegisterReload } from "./register-queries";
import type { RegisterSummary } from "./registers-api";

function createServices(
  overrides: Partial<AssignQrPointOfSaleModalServices> = {},
): AssignQrPointOfSaleModalServices {
  return {
    assignQrPointOfSale: vi.fn(),
    ...overrides,
  };
}

const assigned: RegisterSummary = {
  id: "register-1",
  name: "Caja 1",
  pendingCode: null,
  pointOfSaleNumber: null,
  pointTerminalId: null,
  pointTerminalVersion: 0,
  qrExternalPosId: "CAJA1_STORE_POS",
  qrPointOfSaleVersion: 2,
  installation: null,
};

const unassigned: RegisterSummary = { ...assigned, qrExternalPosId: null, qrPointOfSaleVersion: 0 };

type ModalOptions = {
  target?: RegisterSummary | null;
  services?: AssignQrPointOfSaleModalServices;
  onClose?: () => void;
  onSaved?: () => void;
  reload?: (id: string) => Promise<RegisterReload>;
  onSessionEnded?: () => void;
};

function found(register: RegisterSummary) {
  return Promise.resolve({ kind: "found", register } as const);
}

function modalElement({
  target = assigned,
  services = createServices(),
  onClose = () => {},
  onSaved = () => {},
  reload = () => found(assigned),
  onSessionEnded = () => {},
}: ModalOptions) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <AssignQrPointOfSaleModal
          target={target}
          services={services}
          onClose={onClose}
          onSaved={onSaved}
          reload={reload}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>
  );
}

async function renderModal(options: ModalOptions = {}) {
  const screen = await render(modalElement(options));
  return { screen, dialog: screen.getByRole("dialog", { name: "Asignar QR de Mercado Pago" }) };
}

function save(dialog: Locator) {
  return userEvent.click(dialog.getByRole("button", { name: "Guardar" }));
}

function codeField(dialog: Locator) {
  return dialog.getByRole("textbox", { name: /^Código de la caja QR en Mercado Pago/ });
}

test("names the register in the eyebrow and prefills the current code", async () => {
  const { dialog } = await renderModal();

  await expect.element(dialog.getByText("Caja 1").first()).toBeVisible();
  await expect.element(codeField(dialog)).toHaveValue("CAJA1_STORE_POS");
  await expectNoAccessibilityViolations(document.body);
});

test("explains where the code comes from", async () => {
  const { dialog } = await renderModal();

  await expect
    .element(dialog.getByText("El que figura en la caja QR dentro de tu cuenta de Mercado Pago"))
    .toBeVisible();
});

test("saves the typed code with the version it was loaded with and reports it saved", async () => {
  const services = createServices();
  vi.mocked(services.assignQrPointOfSale).mockResolvedValue({ kind: "ok" });
  const onSaved = vi.fn();
  const { dialog } = await renderModal({ services, onSaved });

  await userEvent.fill(codeField(dialog), " CAJA9_STORE_POS ");
  await save(dialog);

  await expect.poll(() => onSaved.mock.calls.length).toBe(1);
  expect(services.assignQrPointOfSale).toHaveBeenCalledWith("register-1", {
    external_pos_id: "CAJA9_STORE_POS",
    version: 2,
  });
});

test("offers no removal for a register without a QR point of sale", async () => {
  const { dialog } = await renderModal({ target: unassigned });

  await expect.element(codeField(dialog)).toHaveValue("");
  expect(dialog.getByRole("button", { name: "Quitar QR" }).query()).toBeNull();
});

test("removes the QR point of sale by sending null with the loaded version", async () => {
  const services = createServices();
  vi.mocked(services.assignQrPointOfSale).mockResolvedValue({ kind: "ok" });
  const onSaved = vi.fn();
  const { dialog } = await renderModal({ services, onSaved });

  await userEvent.click(dialog.getByRole("button", { name: "Quitar QR" }));

  await expect.poll(() => onSaved.mock.calls.length).toBe(1);
  expect(services.assignQrPointOfSale).toHaveBeenCalledWith("register-1", {
    external_pos_id: null,
    version: 2,
  });
});

test("requires a QR point of sale before saving, without calling the cloud", async () => {
  const services = createServices();
  const { dialog } = await renderModal({ target: unassigned, services });

  await save(dialog);

  await expect.element(dialog.getByText("Ingresá el código de la caja QR.")).toBeVisible();
  expect(services.assignQrPointOfSale).not.toHaveBeenCalled();
});

test("Cancelar asks to close without calling the cloud", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const { dialog } = await renderModal({ services, onClose });

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(services.assignQrPointOfSale).not.toHaveBeenCalled();
});

test("shows on the field that the QR point of sale belongs to another register", async () => {
  const services = createServices();
  vi.mocked(services.assignQrPointOfSale).mockResolvedValue({ kind: "qr_point_of_sale_taken" });
  const onSaved = vi.fn();
  const { dialog } = await renderModal({ services, onSaved });

  await save(dialog);

  await expect.element(dialog.getByText("Esa caja QR ya está asignada a otra caja")).toBeVisible();
  expect(onSaved).not.toHaveBeenCalled();
});

test("shows the message of the field the cloud refused", async () => {
  const services = createServices();
  vi.mocked(services.assignQrPointOfSale).mockResolvedValue({
    kind: "validation_failed",
    field: "external_pos_id",
  });
  const { dialog } = await renderModal({ services });

  await save(dialog);

  await expect
    .element(dialog.getByText("El código de la caja QR no puede tener espacios."))
    .toBeVisible();
});

test("shows the attempt-failed notice when the save fails", async () => {
  const services = createServices();
  vi.mocked(services.assignQrPointOfSale).mockResolvedValue({ kind: "failed" });
  const { dialog } = await renderModal({ services });

  await save(dialog);

  await expect.element(dialog.getByText("No se pudo guardar la caja QR")).toBeVisible();
  await expect.element(dialog.getByText("Probá de nuevo.")).toBeVisible();
});

test("shows the attempt-failed notice when the removal fails", async () => {
  const services = createServices();
  vi.mocked(services.assignQrPointOfSale).mockResolvedValue({ kind: "qr_point_of_sale_taken" });
  const { dialog } = await renderModal({ services });

  await userEvent.click(dialog.getByRole("button", { name: "Quitar QR" }));

  await expect.element(dialog.getByText("No se pudo guardar la caja QR")).toBeVisible();
});

test("shows the rate-limit notice with the wait", async () => {
  const services = createServices();
  vi.mocked(services.assignQrPointOfSale).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  const { dialog } = await renderModal({ services });

  await save(dialog);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("ends the session when the save finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.assignQrPointOfSale).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal({ services, onSessionEnded });

  await save(dialog);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when the save comes back forbidden", async () => {
  window.history.pushState(null, "", "/registers");
  const services = createServices();
  vi.mocked(services.assignQrPointOfSale).mockResolvedValue({ kind: "forbidden" });
  const { dialog } = await renderModal({ services });

  await save(dialog);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("reads the register again when the save finds it missing, and says it no longer exists when it is gone", async () => {
  const services = createServices();
  vi.mocked(services.assignQrPointOfSale).mockResolvedValue({ kind: "not_found" });
  const reload = vi.fn(() => Promise.resolve({ kind: "not_found" } as const));
  const { dialog } = await renderModal({ services, reload });

  await save(dialog);

  await expect.element(dialog.getByText("La caja ya no existe")).toBeVisible();
  expect(reload).toHaveBeenCalledWith("register-1");
  await expect.element(dialog.getByRole("button", { name: "Guardar" })).toBeDisabled();
  await expect.element(dialog.getByRole("button", { name: "Cancelar" })).toBeEnabled();
});

test("offers to reload when the register could not be read again after the save found it missing", async () => {
  const services = createServices();
  vi.mocked(services.assignQrPointOfSale).mockResolvedValue({ kind: "not_found" });
  const reload = vi.fn(() => Promise.resolve({ kind: "failed" } as const));
  const { dialog } = await renderModal({ services, reload });

  await save(dialog);

  await expect.element(dialog.getByText("No se pudieron recargar los datos")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Recargar" })).toBeVisible();
});

test("ends the session when reading the register again finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.assignQrPointOfSale).mockResolvedValue({ kind: "not_found" });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal({
    services,
    onSessionEnded,
    reload: () => Promise.resolve({ kind: "unauthenticated" } as const),
  });

  await save(dialog);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("shows a stale-version notice, and Recargar reads the register again so the second save sends the new version", async () => {
  const services = createServices();
  vi.mocked(services.assignQrPointOfSale).mockResolvedValueOnce({ kind: "stale_version" });
  const changed: RegisterSummary = {
    ...assigned,
    qrExternalPosId: "CAJA7_STORE_POS",
    qrPointOfSaleVersion: 5,
  };
  const { dialog } = await renderModal({ services, reload: () => found(changed) });
  await save(dialog);
  await expect.element(dialog.getByText("La caja QR cambió mientras la editabas")).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect.element(codeField(dialog)).toHaveValue("CAJA7_STORE_POS");
  vi.mocked(services.assignQrPointOfSale).mockResolvedValueOnce({ kind: "ok" });
  await userEvent.click(dialog.getByRole("button", { name: "Guardar" }));
  await expect.poll(() => vi.mocked(services.assignQrPointOfSale).mock.calls.length).toBe(2);
  expect(services.assignQrPointOfSale).toHaveBeenLastCalledWith("register-1", {
    external_pos_id: "CAJA7_STORE_POS",
    version: 5,
  });
});

test("removing after a reload sends the reloaded version", async () => {
  const services = createServices();
  vi.mocked(services.assignQrPointOfSale).mockResolvedValueOnce({ kind: "stale_version" });
  const changed: RegisterSummary = {
    ...assigned,
    qrExternalPosId: "CAJA7_STORE_POS",
    qrPointOfSaleVersion: 5,
  };
  const { dialog } = await renderModal({ services, reload: () => found(changed) });
  await save(dialog);
  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));
  await expect.element(codeField(dialog)).toHaveValue("CAJA7_STORE_POS");
  vi.mocked(services.assignQrPointOfSale).mockResolvedValueOnce({ kind: "ok" });

  await userEvent.click(dialog.getByRole("button", { name: "Quitar QR" }));

  await expect.poll(() => vi.mocked(services.assignQrPointOfSale).mock.calls.length).toBe(2);
  expect(services.assignQrPointOfSale).toHaveBeenLastCalledWith("register-1", {
    external_pos_id: null,
    version: 5,
  });
});
