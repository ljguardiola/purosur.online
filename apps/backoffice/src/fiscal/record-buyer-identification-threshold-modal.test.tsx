import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { type Locator, page, userEvent } from "vitest/browser";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { render } from "../shell/test-support/render-with-router";
import type { BuyerIdentificationThresholds } from "./buyer-identification-threshold-api";
import {
  RecordBuyerIdentificationThresholdModal,
  type RecordBuyerIdentificationThresholdModalServices,
} from "./record-buyer-identification-threshold-modal";

function createServices(): RecordBuyerIdentificationThresholdModalServices {
  return {
    recordBuyerIdentificationThreshold: vi.fn(),
    fetchSessionAuthorizationOptions: vi.fn(),
    authorizeSession: vi.fn(),
    startAuthentication: vi.fn(),
  };
}

function grantAuthorization(services: RecordBuyerIdentificationThresholdModalServices) {
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: { challenge: "session-auth" } as never,
  });
  vi.mocked(services.startAuthentication).mockResolvedValue({ id: "existing-cred" } as never);
  vi.mocked(services.authorizeSession).mockResolvedValue({ kind: "ok" });
}

const recorded = { id: "threshold-2", amount: 1_500_000, validFrom: "2026-10-01" };
const earliest = "2026-10-08";
const inEffect = { id: "threshold-1", amount: 1_000_000, validFrom: "2026-09-15" };

function overview(current: typeof recorded): BuyerIdentificationThresholds {
  return { inEffect: current, scheduled: null, earliestValidFrom: earliest };
}

type Reload = () => Promise<CloudReadOutcome<BuyerIdentificationThresholds>>;

type ModalOptions = {
  open?: boolean;
  services?: RecordBuyerIdentificationThresholdModalServices;
  onClose?: () => void;
  onRecorded?: () => void;
  reload?: Reload;
  onSessionEnded?: () => void;
};

function modalElement({
  open = true,
  services = createServices(),
  onClose = () => {},
  onRecorded = () => {},
  reload = () => Promise.resolve({ kind: "ok", value: overview(inEffect) }),
  onSessionEnded = () => {},
}: ModalOptions) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <RecordBuyerIdentificationThresholdModal
          open={open}
          services={services}
          onClose={onClose}
          onRecorded={onRecorded}
          reload={reload}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>
  );
}

async function renderModal(options: ModalOptions = {}) {
  await page.viewport(1440, 1000);
  const screen = await render(modalElement(options));
  return { screen, dialog: screen.getByRole("dialog") };
}

async function fillForm(dialog: Locator, amount: string, typedDate: string) {
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Importe/ }), amount);
  await userEvent.click(
    dialog
      .getByRole("group", { name: /^Vigente desde/ })
      .getByRole("spinbutton")
      .first(),
  );
  await userEvent.keyboard(typedDate);
}

function submit(dialog: Locator) {
  return userEvent.click(dialog.getByRole("button", { name: "Cargar el umbral" }));
}

test("asks for the amount and the day the threshold starts, under its own title", async () => {
  const { dialog } = await renderModal();

  await expect.element(dialog.getByText("Configuración fiscal")).toBeVisible();
  await expect
    .element(dialog.getByRole("heading", { name: "Cargar un umbral nuevo" }))
    .toBeVisible();
  await expect.element(dialog.getByRole("textbox", { name: /^Importe/ })).toHaveValue("");
  await expect.element(dialog.getByRole("group", { name: /^Vigente desde/ })).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Cargar el umbral" })).toBeVisible();
});

test("Cancelar asks to close without calling the cloud", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const { dialog } = await renderModal({ services, onClose });

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(services.recordBuyerIdentificationThreshold).not.toHaveBeenCalled();
});

test("requires both fields, without calling the cloud", async () => {
  const services = createServices();
  const { dialog } = await renderModal({ services });

  await submit(dialog);

  await expect.element(dialog.getByText("Ingresá el importe del umbral.")).toBeVisible();
  await expect.element(dialog.getByText("Elegí desde cuándo rige el umbral.")).toBeVisible();
  expect(services.recordBuyerIdentificationThreshold).not.toHaveBeenCalled();
});

test("refuses an amount of zero, without calling the cloud", async () => {
  const services = createServices();
  const { dialog } = await renderModal({ services });
  await fillForm(dialog, "0", "01102026");

  await submit(dialog);

  await expect.element(dialog.getByText("Ingresá un importe mayor a cero.")).toBeVisible();
  expect(services.recordBuyerIdentificationThreshold).not.toHaveBeenCalled();
});

test("records the amount in cents and the day, reads the thresholds again, then reports it recorded", async () => {
  const services = createServices();
  vi.mocked(services.recordBuyerIdentificationThreshold).mockResolvedValue({
    kind: "ok",
    value: recorded,
  });
  const reload = vi.fn<Reload>(() => Promise.resolve({ kind: "ok", value: overview(recorded) }));
  const onRecorded = vi.fn();
  const { dialog } = await renderModal({ services, reload, onRecorded });
  await fillForm(dialog, "15.000,00", "01102026");

  await submit(dialog);

  await expect.poll(() => onRecorded.mock.calls.length).toBe(1);
  expect(onRecorded).toHaveBeenCalledWith(recorded);
  expect(services.recordBuyerIdentificationThreshold).toHaveBeenCalledWith({
    amount: 1_500_000,
    valid_from: "2026-10-01",
  });
  expect(reload).toHaveBeenCalledTimes(1);
});

test("keeps the buttons disabled while the thresholds are read again after recording", async () => {
  const services = createServices();
  vi.mocked(services.recordBuyerIdentificationThreshold).mockResolvedValue({
    kind: "ok",
    value: recorded,
  });
  let finishReading: (outcome: Awaited<ReturnType<Reload>>) => void = () => {};
  const reload = vi.fn<Reload>(
    () =>
      new Promise((resolve) => {
        finishReading = resolve;
      }),
  );
  const onRecorded = vi.fn();
  const { dialog } = await renderModal({ services, reload, onRecorded });
  await fillForm(dialog, "15.000,00", "01102026");

  await submit(dialog);

  await expect.element(dialog.getByRole("button", { name: "Cargar el umbral" })).toBeDisabled();
  await expect.element(dialog.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  expect(onRecorded).not.toHaveBeenCalled();
  finishReading({ kind: "ok", value: overview(recorded) });
  await expect.poll(() => onRecorded.mock.calls.length).toBe(1);
});

test("opens the authorization modal on authorization_required, then authorizes and records again", async () => {
  const services = createServices();
  vi.mocked(services.recordBuyerIdentificationThreshold).mockResolvedValueOnce({
    kind: "authorization_required",
  });
  grantAuthorization(services);
  vi.mocked(services.recordBuyerIdentificationThreshold).mockResolvedValueOnce({
    kind: "ok",
    value: recorded,
  });
  const onRecorded = vi.fn();
  const { dialog } = await renderModal({ services, onRecorded });
  await fillForm(dialog, "15.000,00", "01102026");

  await submit(dialog);
  await expect.element(dialog.getByRole("heading", { name: "Autorizá este cambio" })).toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "Cargar un umbral nuevo necesita tu autorización. Confirmala con tu passkey.",
      ),
    )
    .toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect
    .poll(() => vi.mocked(services.recordBuyerIdentificationThreshold).mock.calls.length)
    .toBe(2);
  await expect.poll(() => onRecorded.mock.calls.length).toBe(1);
});

test("cancelling the authorization records nothing and leaves the modal as it was", async () => {
  const services = createServices();
  vi.mocked(services.recordBuyerIdentificationThreshold).mockResolvedValue({
    kind: "authorization_required",
  });
  const onRecorded = vi.fn();
  const { screen, dialog } = await renderModal({ services, onRecorded });
  await fillForm(dialog, "15.000,00", "01102026");
  await submit(dialog);
  const authorization = screen.getByRole("heading", { name: "Autorizá este cambio" });
  await expect.element(authorization).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }).last());

  await expect.element(authorization).not.toBeInTheDocument();
  expect(services.recordBuyerIdentificationThreshold).toHaveBeenCalledTimes(1);
  expect(onRecorded).not.toHaveBeenCalled();
  await expect.element(dialog.getByRole("textbox", { name: /^Importe/ })).toHaveValue("15.000,00");
});

test("a start before today lands on Vigente desde, naming today as read again from the cloud", async () => {
  const services = createServices();
  vi.mocked(services.recordBuyerIdentificationThreshold).mockResolvedValue({
    kind: "before_today",
  });
  const onRecorded = vi.fn();
  const reload = vi.fn<Reload>(() => Promise.resolve({ kind: "ok", value: overview(inEffect) }));
  const { dialog } = await renderModal({ services, reload, onRecorded });
  await fillForm(dialog, "15.000,00", "01092026");

  await submit(dialog);

  await expect
    .element(dialog.getByText("Tiene que ser desde hoy (08/10/2026) en adelante."))
    .toBeVisible();
  expect(onRecorded).not.toHaveBeenCalled();
  expect(reload).toHaveBeenCalledTimes(1);
  await expectNoAccessibilityViolations(document.body);
});

test("a start before today asks to review the day when the thresholds cannot be read again", async () => {
  const services = createServices();
  vi.mocked(services.recordBuyerIdentificationThreshold).mockResolvedValue({
    kind: "before_today",
  });
  const { dialog } = await renderModal({
    services,
    reload: () => Promise.resolve({ kind: "failed" }),
  });
  await fillForm(dialog, "15.000,00", "01092026");

  await submit(dialog);

  await expect.element(dialog.getByText("Revisá la fecha.")).toBeVisible();
});

test("the error on Vigente desde clears as soon as the day is edited", async () => {
  const services = createServices();
  vi.mocked(services.recordBuyerIdentificationThreshold).mockResolvedValue({
    kind: "before_today",
  });
  const { dialog } = await renderModal({ services });
  await fillForm(dialog, "15.000,00", "01092026");
  await submit(dialog);
  await expect.element(dialog.getByText(/^Tiene que ser desde hoy/)).toBeVisible();

  await userEvent.click(
    dialog
      .getByRole("group", { name: /^Vigente desde/ })
      .getByRole("spinbutton")
      .first(),
  );
  await userEvent.keyboard("{ArrowUp}");

  await expect.element(dialog.getByText(/^Tiene que ser desde hoy/)).not.toBeInTheDocument();
});

const CONFIRMATION_TITLE = "¿Cargar un umbral menor que el vigente?";

function askLowerAmountConfirmation(services: RecordBuyerIdentificationThresholdModalServices) {
  vi.mocked(services.recordBuyerIdentificationThreshold).mockResolvedValueOnce({
    kind: "needs_confirmation",
    inEffectAmount: 1_000_000,
    amount: 10_000,
    validFrom: "2026-10-01",
  });
}

test("a lower amount than the one in effect asks to confirm it, showing the amount in effect, the new amount and the day it takes effect", async () => {
  const services = createServices();
  askLowerAmountConfirmation(services);
  const onRecorded = vi.fn();
  const { screen, dialog } = await renderModal({ services, onRecorded });
  await fillForm(dialog, "100,00", "01102026");

  await submit(dialog);

  const confirmation = screen.getByRole("dialog", { name: CONFIRMATION_TITLE });
  await expect.element(confirmation).toBeVisible();
  await expect
    .element(
      confirmation.getByText(
        "El umbral vigente es $ 10.000,00. El nuevo, de $ 100,00, rige desde el 01/10/2026.",
      ),
    )
    .toBeVisible();
  expect(onRecorded).not.toHaveBeenCalled();
  expect(services.recordBuyerIdentificationThreshold).toHaveBeenCalledTimes(1);
  await expectNoAccessibilityViolations(document.body);
});

test("confirming the lower amount sends the same request again with the confirmation, then reports it recorded", async () => {
  const services = createServices();
  askLowerAmountConfirmation(services);
  vi.mocked(services.recordBuyerIdentificationThreshold).mockResolvedValueOnce({
    kind: "ok",
    value: recorded,
  });
  const onRecorded = vi.fn();
  const { screen, dialog } = await renderModal({ services, onRecorded });
  await fillForm(dialog, "100,00", "01102026");
  await submit(dialog);

  await userEvent.click(
    screen
      .getByRole("dialog", { name: CONFIRMATION_TITLE })
      .getByRole("button", { name: "Cargar igual" }),
  );

  await expect.poll(() => onRecorded.mock.calls.length).toBe(1);
  expect(services.recordBuyerIdentificationThreshold).toHaveBeenLastCalledWith({
    amount: 10_000,
    valid_from: "2026-10-01",
    confirm_lower_than_in_effect: true,
  });
  await expect
    .poll(() => screen.getByRole("dialog", { name: CONFIRMATION_TITLE }).query())
    .toBeNull();
});

test("going back from the confirmation records nothing and keeps what was typed", async () => {
  const services = createServices();
  askLowerAmountConfirmation(services);
  const onRecorded = vi.fn();
  const { screen, dialog } = await renderModal({ services, onRecorded });
  await fillForm(dialog, "100,00", "01102026");
  await submit(dialog);

  await userEvent.click(
    screen
      .getByRole("dialog", { name: CONFIRMATION_TITLE })
      .getByRole("button", { name: "Volver" }),
  );

  await expect
    .poll(() => screen.getByRole("dialog", { name: CONFIRMATION_TITLE }).query())
    .toBeNull();
  expect(services.recordBuyerIdentificationThreshold).toHaveBeenCalledTimes(1);
  expect(onRecorded).not.toHaveBeenCalled();
  await expect.element(dialog.getByRole("textbox", { name: /^Importe/ })).toHaveValue("100,00");
});

test("asks to confirm again when the amount is edited and sent after going back", async () => {
  const services = createServices();
  askLowerAmountConfirmation(services);
  vi.mocked(services.recordBuyerIdentificationThreshold).mockResolvedValueOnce({
    kind: "needs_confirmation",
    inEffectAmount: 1_000_000,
    amount: 20_000,
    validFrom: "2026-10-01",
  });
  const { screen, dialog } = await renderModal({ services });
  await fillForm(dialog, "100,00", "01102026");
  await submit(dialog);
  await userEvent.click(
    screen
      .getByRole("dialog", { name: CONFIRMATION_TITLE })
      .getByRole("button", { name: "Volver" }),
  );
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Importe/ }), "200,00");

  await submit(dialog);

  await expect
    .element(screen.getByRole("dialog", { name: CONFIRMATION_TITLE }).getByText(/\$ 200,00/))
    .toBeVisible();
  expect(services.recordBuyerIdentificationThreshold).toHaveBeenLastCalledWith({
    amount: 20_000,
    valid_from: "2026-10-01",
  });
});

test("shows the attempt-failed notice in the form when the confirmed record fails", async () => {
  const services = createServices();
  askLowerAmountConfirmation(services);
  vi.mocked(services.recordBuyerIdentificationThreshold).mockResolvedValueOnce({ kind: "failed" });
  const { screen, dialog } = await renderModal({ services });
  await fillForm(dialog, "100,00", "01102026");
  await submit(dialog);

  await userEvent.click(
    screen
      .getByRole("dialog", { name: CONFIRMATION_TITLE })
      .getByRole("button", { name: "Cargar igual" }),
  );

  await expect.element(dialog.getByText("No se pudo cargar el umbral")).toBeVisible();
  await expect
    .poll(() => screen.getByRole("dialog", { name: CONFIRMATION_TITLE }).query())
    .toBeNull();
});

test("a confirmed record refused for starting before today lands on Vigente desde, naming today as read again from the cloud", async () => {
  const services = createServices();
  askLowerAmountConfirmation(services);
  vi.mocked(services.recordBuyerIdentificationThreshold).mockResolvedValueOnce({
    kind: "before_today",
  });
  const reload = vi.fn<Reload>(() => Promise.resolve({ kind: "ok", value: overview(inEffect) }));
  const { screen, dialog } = await renderModal({ services, reload });
  await fillForm(dialog, "100,00", "01102026");
  await submit(dialog);

  await userEvent.click(
    screen
      .getByRole("dialog", { name: CONFIRMATION_TITLE })
      .getByRole("button", { name: "Cargar igual" }),
  );

  await expect
    .element(dialog.getByText("Tiene que ser desde hoy (08/10/2026) en adelante."))
    .toBeVisible();
  expect(dialog.getByText("No se pudo cargar el umbral").query()).toBeNull();
  expect(reload).toHaveBeenCalledTimes(1);
});

test("a confirmed record refused by the cloud on the amount shows the field error, not the attempt-failed notice", async () => {
  const services = createServices();
  askLowerAmountConfirmation(services);
  vi.mocked(services.recordBuyerIdentificationThreshold).mockResolvedValueOnce({
    kind: "validation_failed",
    field: "amount",
  });
  const { screen, dialog } = await renderModal({ services });
  await fillForm(dialog, "100,00", "01102026");
  await submit(dialog);

  await userEvent.click(
    screen
      .getByRole("dialog", { name: CONFIRMATION_TITLE })
      .getByRole("button", { name: "Cargar igual" }),
  );

  await expect.element(dialog.getByText("Revisá el importe.")).toBeVisible();
  expect(dialog.getByText("No se pudo cargar el umbral").query()).toBeNull();
});

test("shows a field error from the cloud on the amount, and keeps the modal open", async () => {
  const services = createServices();
  vi.mocked(services.recordBuyerIdentificationThreshold).mockResolvedValue({
    kind: "validation_failed",
    field: "amount",
  });
  const onRecorded = vi.fn();
  const { dialog } = await renderModal({ services, onRecorded });
  await fillForm(dialog, "15.000,00", "01102026");

  await submit(dialog);

  await expect.element(dialog.getByText("Revisá el importe.")).toBeVisible();
  expect(onRecorded).not.toHaveBeenCalled();
});

test("shows the attempt-failed notice, and no field error, when the cloud names a field the form does not show", async () => {
  const services = createServices();
  vi.mocked(services.recordBuyerIdentificationThreshold).mockResolvedValue({
    kind: "validation_failed",
    field: "id",
  });
  const { dialog } = await renderModal({ services });
  await fillForm(dialog, "15.000,00", "01102026");

  await submit(dialog);

  await expect.element(dialog.getByText("No se pudo cargar el umbral")).toBeVisible();
  expect(dialog.getByText("Revisá el importe.").query()).toBeNull();
});

test("shows the attempt-failed notice when recording fails, and keeps what was typed", async () => {
  const services = createServices();
  vi.mocked(services.recordBuyerIdentificationThreshold).mockResolvedValue({ kind: "failed" });
  const { dialog } = await renderModal({ services });
  await fillForm(dialog, "15.000,00", "01102026");

  await submit(dialog);

  await expect.element(dialog.getByText("No se pudo cargar el umbral")).toBeVisible();
  await expect.element(dialog.getByText("Probá de nuevo.")).toBeVisible();
  await expect.element(dialog.getByRole("textbox", { name: /^Importe/ })).toHaveValue("15.000,00");
});

test("sends to Mi cuenta when recording comes back forbidden", async () => {
  window.history.pushState(null, "", "/fiscal-settings");
  const services = createServices();
  vi.mocked(services.recordBuyerIdentificationThreshold).mockResolvedValue({ kind: "forbidden" });
  const { dialog } = await renderModal({ services });
  await fillForm(dialog, "15.000,00", "01102026");

  await submit(dialog);

  await expect.poll(() => window.location.pathname).toBe("/account");
  window.history.pushState(null, "", "/");
});

test("ends the session when recording comes back unauthenticated", async () => {
  const services = createServices();
  vi.mocked(services.recordBuyerIdentificationThreshold).mockResolvedValue({
    kind: "unauthenticated",
  });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal({ services, onSessionEnded });
  await fillForm(dialog, "15.000,00", "01102026");

  await submit(dialog);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("opens empty again after it was closed with values typed", async () => {
  const { screen, dialog } = await renderModal();
  await fillForm(dialog, "15.000,00", "01102026");

  await screen.rerender(modalElement({ open: false }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await screen.rerender(modalElement({ open: true }));

  await expect
    .element(screen.getByRole("dialog").getByRole("textbox", { name: /^Importe/ }))
    .toHaveValue("");
});

test("has no accessibility violations", async () => {
  const { dialog } = await renderModal();
  await expect
    .element(dialog.getByRole("heading", { name: "Cargar un umbral nuevo" }))
    .toBeVisible();

  await expectNoAccessibilityViolations(document.body);
});
