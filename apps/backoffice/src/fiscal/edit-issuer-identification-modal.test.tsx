import { FICTIONAL_CUIT, FICTIONAL_LEGAL_NAME } from "@purosur/domain/fiscal/test-support";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { type Locator, page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  EditIssuerIdentificationModal,
  type EditIssuerIdentificationModalServices,
} from "./edit-issuer-identification-modal";
import type { IssuerIdentification } from "./issuer-identification-api";

function createServices(
  overrides: Partial<EditIssuerIdentificationModalServices> = {},
): EditIssuerIdentificationModalServices {
  return {
    saveIssuerIdentification: vi.fn(),
    fetchSessionAuthorizationOptions: vi.fn(),
    authorizeSession: vi.fn(),
    startAuthentication: vi.fn(),
    ...overrides,
  };
}

const authorizationOptions = { challenge: "session-auth" } as never;
const assertion = { id: "existing-cred" } as never;

function grantAuthorization(services: EditIssuerIdentificationModalServices) {
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: authorizationOptions,
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(assertion);
  vi.mocked(services.authorizeSession).mockResolvedValue({ kind: "ok" });
}

const complete: IssuerIdentification = {
  legalName: FICTIONAL_LEGAL_NAME,
  grossIncomeRegistration: "0000000-00",
  activityStartDate: "2019-03-01",
  authorizedCuit: FICTIONAL_CUIT,
  taxStatus: "Responsable Monotributo",
  version: 1,
};

const incomplete: IssuerIdentification = {
  legalName: null,
  grossIncomeRegistration: null,
  activityStartDate: null,
  authorizedCuit: FICTIONAL_CUIT,
  taxStatus: "Responsable Monotributo",
  version: 1,
};

type ModalOptions = {
  target?: IssuerIdentification | null;
  services?: EditIssuerIdentificationModalServices;
  onClose?: () => void;
  onSaved?: () => void;
  reload?: () => ReturnType<typeof reloadOk>;
  onSessionEnded?: () => void;
  now?: () => Date;
};

function reloadOk(value: IssuerIdentification) {
  return Promise.resolve({ kind: "ok", value } as const);
}

function modalElement({
  target = complete,
  services = createServices(),
  onClose = () => {},
  onSaved = () => {},
  reload = () => reloadOk(complete),
  onSessionEnded = () => {},
  now = () => new Date("2020-09-25T15:00:00-03:00"),
}: ModalOptions) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <EditIssuerIdentificationModal
          target={target}
          services={services}
          onClose={onClose}
          onSaved={onSaved}
          reload={reload}
          onSessionEnded={onSessionEnded}
          now={now}
        />
      </main>
    </FieldSizeProvider>
  );
}

async function renderModal(options: ModalOptions = {}) {
  const screen = await render(modalElement(options));
  return { screen, dialog: screen.getByRole("dialog") };
}

const lateEveningInArgentina = () => new Date("2020-09-25T23:30:00-03:00");
const afternoonInArgentina = () => new Date("2020-09-25T15:00:00-03:00");

async function typeActivityStartDate(dialog: Locator, typedDate: string) {
  await userEvent.click(
    dialog
      .getByRole("group", { name: /^Inicio de actividades/ })
      .getByRole("spinbutton")
      .first(),
  );
  await userEvent.keyboard(typedDate);
}

async function fillIncompleteForm(dialog: Locator, typedDate: string) {
  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Razón social/ }),
    "Comercio de Prueba Nuevo",
  );
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Ingresos Brutos/ }), "0000000-00");
  await typeActivityStartDate(dialog, typedDate);
}

function save(dialog: Locator) {
  return userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
}

test("refuses a future activity start date, counting today as Argentina's day", async () => {
  const services = createServices();
  const { dialog } = await renderModal({
    target: incomplete,
    services,
    now: lateEveningInArgentina,
  });
  await fillIncompleteForm(dialog, "26092020");

  await save(dialog);

  await expect.element(dialog.getByText("La fecha no puede ser futura.")).toBeVisible();
  expect(services.saveIssuerIdentification).not.toHaveBeenCalled();
});

test("accepts today as the activity start date", async () => {
  const services = createServices();
  vi.mocked(services.saveIssuerIdentification).mockResolvedValue({ kind: "ok" });
  const { dialog } = await renderModal({ target: incomplete, services, now: afternoonInArgentina });
  await fillIncompleteForm(dialog, "25092020");

  await save(dialog);

  await expect.poll(() => vi.mocked(services.saveIssuerIdentification).mock.calls.length).toBe(1);
  expect(services.saveIssuerIdentification).toHaveBeenCalledWith(
    expect.objectContaining({ activity_start_date: "2020-09-25" }),
  );
});

test("counts today, for refusing a future activity start date, from the time the modal was opened", async () => {
  let current = new Date("2020-09-25T15:00:00-03:00");
  const onClose = vi.fn();
  const { screen, dialog } = await renderModal({ target: incomplete, now: () => current });
  await fillIncompleteForm(dialog, "26092020");
  await expect.element(dialog.getByText("La fecha no puede ser futura.")).toBeVisible();

  current = new Date("2020-09-26T15:00:00-03:00");
  await screen.rerender(modalElement({ target: incomplete, onClose, now: () => current }));
  expect(dialog.getByText("La fecha no puede ser futura.").query()).not.toBeNull();

  await screen.rerender(modalElement({ target: null, onClose, now: () => current }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await screen.rerender(modalElement({ target: incomplete, onClose, now: () => current }));
  const reopened = screen.getByRole("dialog");
  await typeActivityStartDate(reopened, "26092020");

  await expect
    .element(reopened.getByRole("group", { name: /^Inicio de actividades/ }))
    .toHaveTextContent("26/9/2020");
  expect(reopened.getByText("La fecha no puede ser futura.").query()).toBeNull();
});

test("shows CUIT and tax status as plain text, not inputs, with the fields prefilled", async () => {
  const { dialog } = await renderModal();

  await expect
    .element(dialog.getByRole("heading", { name: "Identificación del emisor" }))
    .toBeVisible();
  await expect
    .element(dialog.getByRole("textbox", { name: /^Razón social/ }))
    .toHaveValue(FICTIONAL_LEGAL_NAME);
  await expect
    .element(dialog.getByRole("textbox", { name: /^Ingresos Brutos/ }))
    .toHaveValue("0000000-00");
  const dateGroup = dialog.getByRole("group", { name: /^Inicio de actividades/ }).element();
  expect(dateGroup.textContent).toContain("1");
  expect(dateGroup.textContent).toContain("3");
  expect(dateGroup.textContent).toContain("2019");
  expect(dialog.getByRole("textbox", { name: "CUIT" }).query()).toBeNull();
  expect(dialog.getByRole("textbox", { name: "Condición frente al IVA" }).query()).toBeNull();
  await expect.element(dialog.getByText(FICTIONAL_CUIT)).toBeVisible();
  await expect.element(dialog.getByText("Responsable Monotributo")).toBeVisible();
});

test("lines up the Ingresos Brutos and Inicio de actividades labels and boxes, side by side in the same row", async () => {
  const { dialog } = await renderModal();

  const grossIncomeLabel = dialog.getByText("Ingresos Brutos").element() as HTMLElement;
  const activityStartLabel = dialog.getByText("Inicio de actividades").element() as HTMLElement;
  const grossIncomeBox = dialog.getByRole("textbox", { name: /^Ingresos Brutos/ }).element()
    .parentElement as HTMLElement;
  const activityStartBox = dialog
    .getByRole("group", { name: /^Inicio de actividades/ })
    .element() as HTMLElement;

  expect(grossIncomeLabel.getBoundingClientRect().top).toBeCloseTo(
    activityStartLabel.getBoundingClientRect().top,
    0,
  );

  const grossIncomeBoxRect = grossIncomeBox.getBoundingClientRect();
  const activityStartBoxRect = activityStartBox.getBoundingClientRect();
  expect(grossIncomeBoxRect.top).toBeCloseTo(activityStartBoxRect.top, 0);
  expect(grossIncomeBoxRect.bottom).toBeCloseTo(activityStartBoxRect.bottom, 0);
});

test("prefills the form empty for an incomplete identification", async () => {
  const { dialog } = await renderModal({ target: incomplete });

  await expect.element(dialog.getByRole("textbox", { name: /^Razón social/ })).toHaveValue("");
  await expect.element(dialog.getByRole("textbox", { name: /^Ingresos Brutos/ })).toHaveValue("");
});

test("Cancelar asks to close without calling saveIssuerIdentification", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const { dialog } = await renderModal({ services, onClose });

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(services.saveIssuerIdentification).not.toHaveBeenCalled();
});

test("requires the three fields, without calling the API", async () => {
  const services = createServices();
  const { dialog } = await renderModal({ target: incomplete, services });

  await save(dialog);

  await expect.element(dialog.getByText("Ingresá la razón social.")).toBeVisible();
  await expect.element(dialog.getByText("Ingresá el número de Ingresos Brutos.")).toBeVisible();
  await expect.element(dialog.getByText("Elegí la fecha de inicio de actividades.")).toBeVisible();
  expect(services.saveIssuerIdentification).not.toHaveBeenCalled();
});

test("refuses a legal name and an Ingresos Brutos registration that are too long, without calling the API", async () => {
  const services = createServices();
  const { dialog } = await renderModal({ services });
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Razón social/ }), "a".repeat(201));
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Ingresos Brutos/ }), "a".repeat(101));

  await save(dialog);

  await expect.element(dialog.getByText("Ingresá como mucho 200 caracteres.")).toBeVisible();
  await expect.element(dialog.getByText("Ingresá como mucho 100 caracteres.")).toBeVisible();
  expect(services.saveIssuerIdentification).not.toHaveBeenCalled();
});

function dateSegments(dialog: Locator): HTMLElement[] {
  const group = dialog.getByRole("group", { name: /^Inicio de actividades/ }).element();
  return Array.from(group.querySelectorAll('[role="spinbutton"]')) as HTMLElement[];
}

function describedTextOf(element: HTMLElement): string {
  return (element.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .filter((id) => id !== "")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
}

test("marks the activity start date required, and invalid and described by its own message once refused", async () => {
  const { dialog } = await renderModal({ target: incomplete });
  for (const segment of dateSegments(dialog)) {
    expect(segment.getAttribute("aria-required")).toBe("true");
  }

  await save(dialog);

  await expect.element(dialog.getByText("Elegí la fecha de inicio de actividades.")).toBeVisible();
  for (const segment of dateSegments(dialog)) {
    expect(segment.getAttribute("aria-invalid")).toBe("true");
    expect(describedTextOf(segment)).toContain("Elegí la fecha de inicio de actividades.");
  }
  await expectNoAccessibilityViolations(document.body);
});

test("offers no day after Argentina's today in the activity start date's calendar", async () => {
  await page.viewport(1440, 1000);
  const { screen, dialog } = await renderModal({
    target: incomplete,
    now: lateEveningInArgentina,
  });
  await userEvent.click(
    dialog.getByRole("group", { name: /^Inicio de actividades/ }).getByRole("button"),
  );

  const calendar = screen.getByRole("grid");
  await expect.element(calendar).toBeVisible();
  const dayButton = (day: string) =>
    Array.from(calendar.element().querySelectorAll('[role="button"]')).find(
      (cell) => cell.textContent?.trim() === day,
    ) as HTMLElement;
  expect(dayButton("25").getAttribute("aria-disabled")).toBeNull();
  expect(dayButton("26").getAttribute("aria-disabled")).toBe("true");
});

test("saves the edit directly, without the authorization modal, when the session already has one, then reads the data again and reports it saved", async () => {
  const services = createServices();
  vi.mocked(services.saveIssuerIdentification).mockResolvedValue({ kind: "ok" });
  const reload = vi.fn(() => reloadOk(complete));
  const onSaved = vi.fn();
  const { dialog } = await renderModal({ services, reload, onSaved });
  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Razón social/ }),
    "Nueva Razón Social SRL",
  );

  await save(dialog);

  await expect.poll(() => onSaved.mock.calls.length).toBe(1);
  expect(services.saveIssuerIdentification).toHaveBeenCalledWith({
    legal_name: "Nueva Razón Social SRL",
    gross_income_registration: "0000000-00",
    activity_start_date: "2019-03-01",
    version: 1,
  });
  expect(reload).toHaveBeenCalledTimes(1);
});

test("opens the authorization modal on authorization_required, then authorizes and retries the save", async () => {
  const services = createServices();
  vi.mocked(services.saveIssuerIdentification).mockResolvedValueOnce({
    kind: "authorization_required",
  });
  grantAuthorization(services);
  vi.mocked(services.saveIssuerIdentification).mockResolvedValueOnce({ kind: "ok" });
  const onSaved = vi.fn();
  const { dialog } = await renderModal({ services, onSaved });

  await save(dialog);
  await expect.element(dialog.getByRole("heading", { name: "Autorizá este cambio" })).toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "Guardar la identificación del emisor necesita tu autorización. Confirmala con tu passkey.",
      ),
    )
    .toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => vi.mocked(services.saveIssuerIdentification).mock.calls.length).toBe(2);
  await expect.poll(() => onSaved.mock.calls.length).toBe(1);
});

test("shows a field error from the server and keeps the modal open", async () => {
  const services = createServices();
  vi.mocked(services.saveIssuerIdentification).mockResolvedValue({
    kind: "validation_failed",
    field: "legal_name",
  });
  const onSaved = vi.fn();
  const { dialog } = await renderModal({ services, onSaved });

  await save(dialog);

  await expect.element(dialog.getByText("Revisá la razón social.")).toBeVisible();
  expect(dialog.getByText(/Ingresá como mucho/).query()).toBeNull();
  expect(onSaved).not.toHaveBeenCalled();
});

test("shows a cloud error on the activity start date's field asking to review a date that is not in the future", async () => {
  const services = createServices();
  vi.mocked(services.saveIssuerIdentification).mockResolvedValue({
    kind: "validation_failed",
    field: "activity_start_date",
  });
  const { dialog } = await renderModal({ services });

  await save(dialog);

  await expect.element(dialog.getByText("Revisá la fecha de inicio de actividades.")).toBeVisible();
  expect(dialog.getByText("La fecha no puede ser futura.").query()).toBeNull();
});

test("a cloud error on a field clears as soon as that field is edited", async () => {
  const services = createServices();
  vi.mocked(services.saveIssuerIdentification).mockResolvedValue({
    kind: "validation_failed",
    field: "gross_income_registration",
  });
  const { dialog } = await renderModal({ services });
  await save(dialog);
  await expect.element(dialog.getByText("Revisá el número de Ingresos Brutos.")).toBeVisible();

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Ingresos Brutos/ }), "0000000-01");

  await expect
    .element(dialog.getByText("Revisá el número de Ingresos Brutos."))
    .not.toBeInTheDocument();
});

test("shows the attempt-failed notice, and no field error, when the cloud names a field the form does not show", async () => {
  const services = createServices();
  vi.mocked(services.saveIssuerIdentification).mockResolvedValue({
    kind: "validation_failed",
    field: "version",
  });
  const { dialog } = await renderModal({ services });

  await save(dialog);

  await expect.element(dialog.getByText("No se pudo guardar el cambio")).toBeVisible();
  expect(dialog.getByText(/Ingresá como mucho/).query()).toBeNull();
});

test("shows the attempt-failed notice when the save fails", async () => {
  const services = createServices();
  vi.mocked(services.saveIssuerIdentification).mockResolvedValue({ kind: "failed" });
  const { dialog } = await renderModal({ services });

  await save(dialog);

  await expect.element(dialog.getByText("No se pudo guardar el cambio")).toBeVisible();
  await expect.element(dialog.getByText("Probá de nuevo.")).toBeVisible();
});

test("after a refused save, editing a field checks it again on every change", async () => {
  const { dialog } = await renderModal({ target: incomplete });
  await save(dialog);
  await expect.element(dialog.getByText("Ingresá la razón social.")).toBeVisible();

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Razón social/ }), "a".repeat(201));

  await expect.element(dialog.getByText("Ingresá como mucho 200 caracteres.")).toBeVisible();
  expect(dialog.getByText("Ingresá la razón social.").query()).toBeNull();
});

function ReloadingModal({
  services,
  reloaded,
}: {
  services: EditIssuerIdentificationModalServices;
  reloaded: IssuerIdentification;
}) {
  const [target, setTarget] = useState(complete);
  return modalElement({
    target,
    services,
    reload: () => {
      setTarget(reloaded);
      return reloadOk(reloaded);
    },
  });
}

test("shows a stale_version notice, and Recargar reads the data again so the second save sends the new version", async () => {
  const services = createServices();
  vi.mocked(services.saveIssuerIdentification).mockResolvedValueOnce({ kind: "stale_version" });
  const reloaded: IssuerIdentification = { ...complete, legalName: "Recargado SRL", version: 5 };
  const screen = await render(<ReloadingModal services={services} reloaded={reloaded} />);
  const dialog = screen.getByRole("dialog");
  await save(dialog);
  await expect
    .element(dialog.getByText("La identificación del emisor cambió mientras la editabas"))
    .toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect
    .element(dialog.getByRole("textbox", { name: /^Razón social/ }))
    .toHaveValue("Recargado SRL");
  vi.mocked(services.saveIssuerIdentification).mockResolvedValueOnce({ kind: "ok" });
  await save(dialog);
  await expect.poll(() => vi.mocked(services.saveIssuerIdentification).mock.calls.length).toBe(2);
  expect(services.saveIssuerIdentification).toHaveBeenLastCalledWith({
    legal_name: "Recargado SRL",
    gross_income_registration: "0000000-00",
    activity_start_date: "2019-03-01",
    version: 5,
  });
});

test("keeps every value of the form, edited or not, when the data changes under an unsaved edit", async () => {
  const { screen, dialog } = await renderModal();
  const legalName = dialog.getByRole("textbox", { name: /^Razón social/ });
  await userEvent.fill(legalName, "Editada SRL");

  await screen.rerender(
    modalElement({ target: { ...complete, grossIncomeRegistration: "999", version: 2 } }),
  );

  await expect.element(legalName).toHaveValue("Editada SRL");
  await expect
    .element(dialog.getByRole("textbox", { name: /^Ingresos Brutos/ }))
    .toHaveValue("0000000-00");
});

test("shows the data that changed in the form over values the person has not edited", async () => {
  const { screen, dialog } = await renderModal();

  await screen.rerender(
    modalElement({ target: { ...complete, legalName: "Refrescada SRL", version: 2 } }),
  );

  await expect
    .element(dialog.getByRole("textbox", { name: /^Razón social/ }))
    .toHaveValue("Refrescada SRL");
});

test("after an unsaved edit and a change in the data, the save sends the version the form was last seeded from", async () => {
  const services = createServices();
  vi.mocked(services.saveIssuerIdentification).mockResolvedValueOnce({ kind: "stale_version" });
  const { screen, dialog } = await renderModal({ services });
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Razón social/ }), "Editada SRL");
  await screen.rerender(modalElement({ services, target: { ...complete, version: 2 } }));

  await save(dialog);

  await expect.poll(() => vi.mocked(services.saveIssuerIdentification).mock.calls.length).toBe(1);
  expect(services.saveIssuerIdentification).toHaveBeenCalledWith(
    expect.objectContaining({ legal_name: "Editada SRL", version: 1 }),
  );
});

test("sends to Mi cuenta when saving comes back forbidden", async () => {
  window.history.pushState(null, "", "/fiscal-settings");
  const services = createServices();
  vi.mocked(services.saveIssuerIdentification).mockResolvedValue({ kind: "forbidden" });
  const { dialog } = await renderModal({ services });

  await save(dialog);

  await expect.poll(() => window.location.pathname).toBe("/account");
  window.history.pushState(null, "", "/");
});

test("ends the session when saving comes back unauthenticated", async () => {
  const services = createServices();
  vi.mocked(services.saveIssuerIdentification).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal({ services, onSessionEnded });

  await save(dialog);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
