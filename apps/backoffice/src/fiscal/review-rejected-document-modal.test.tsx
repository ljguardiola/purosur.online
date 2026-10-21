import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { type Locator, page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { RejectedDocument } from "./fortnight-presentations-api";
import type { RemedyTarget } from "./rejected-document-remedy-form";
import {
  ReviewRejectedDocumentModal,
  type ReviewRejectedDocumentModalServices,
} from "./review-rejected-document-modal";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

const rejectedDocument: RejectedDocument = {
  number: 298,
  unprocessed: 12,
  documentId: "document-1",
  issuedOn: "2026-09-09",
  total: 1_845_000,
  buyerDocumentType: 99,
  buyerDocumentNumber: 0,
  buyerTaxStatusCode: 5,
  rejections: [{ code: 10016, message: "El importe total no coincide con la suma." }],
  remedy: "awaiting_remedy",
};

const target: RemedyTarget = {
  pointOfSaleNumber: 4,
  fortnight: { start: "2026-09-01", end: "2026-09-15" },
  rejectedDocument,
};

const recorded = {
  recordedAt: "2026-09-20T15:30:00.000Z",
  changes: [{ field: "total", before: 1_845_000, after: 1_800_000 }],
};

const reportRequest = {
  point_of_sale_number: 4,
  fortnight_start: "2026-09-01",
  document_type: "factura_c",
  number: 298,
  remedy: { kind: "report" },
};

function createServices(): ReviewRejectedDocumentModalServices {
  return {
    remedyRejectedDocument: vi.fn(),
    fetchSessionAuthorizationOptions: vi
      .fn()
      .mockResolvedValue({ kind: "ok", value: { challenge: "session-auth" } }),
    authorizeSession: vi.fn().mockResolvedValue({ kind: "ok" }),
    startAuthentication: vi.fn().mockResolvedValue({ id: "existing-cred" }),
  };
}

type Handlers = {
  target?: RemedyTarget | null;
  onClose?: () => void;
  onRemedied?: (target: RemedyTarget, value: typeof recorded) => void;
  onOutdated?: () => void;
  onSessionEnded?: () => void;
};

async function renderModal(services: ReviewRejectedDocumentModalServices, handlers: Handlers = {}) {
  await page.viewport(1440, 1000);
  const screen = await render(
    <FieldSizeProvider size="backoffice">
      <main>
        <ReviewRejectedDocumentModal
          target={handlers.target === undefined ? target : handlers.target}
          onClose={handlers.onClose ?? (() => {})}
          onRemedied={handlers.onRemedied ?? (() => {})}
          onOutdated={handlers.onOutdated ?? (() => {})}
          onSessionEnded={handlers.onSessionEnded ?? (() => {})}
          services={services}
        />
      </main>
    </FieldSizeProvider>,
  );
  const dialog = screen.getByRole("dialog", { name: "Revisar el rechazo" });
  await expect.element(dialog).toBeVisible();
  return { screen, dialog };
}

function chooseTheDocumentIsWrong(dialog: Locator) {
  return userEvent.click(dialog.getByRole("radio", { name: "En el comprobante impreso" }));
}

function submitReport(dialog: Locator) {
  return userEvent.click(dialog.getByRole("button", { name: "Corregir el informe" }));
}

function submitPrinted(dialog: Locator) {
  return userEvent.click(
    dialog.getByRole("button", { name: "Corregir y anular con nota de crédito" }),
  );
}

test("names the report and the point of sale, shows the rejected document and what ARCA reported", async () => {
  const { dialog } = await renderModal(createServices());

  await expect
    .element(dialog.getByText("Informe del 1 al 15 de septiembre de 2026 · Punto de venta 00004"))
    .toBeVisible();
  await expect.element(dialog.getByRole("heading", { name: "Revisar el rechazo" })).toBeVisible();
  await expect.element(dialog.getByText("Factura C · CAEA")).toBeVisible();
  await expect.element(dialog.getByText("Nº 00000298")).toBeVisible();
  await expect.element(dialog.getByText("09/09/2026")).toBeVisible();
  await expect.element(dialog.getByText("$ 18.450,00")).toBeVisible();
  await expect.element(dialog.getByText("Lo que informó ARCA")).toBeVisible();
  await expect.element(dialog.getByText("El importe total no coincide con la suma.")).toBeVisible();
});

test("lists every observation ARCA made", async () => {
  const { dialog } = await renderModal(createServices(), {
    target: {
      ...target,
      rejectedDocument: {
        ...rejectedDocument,
        rejections: [
          { code: 10016, message: "Primera observación." },
          { code: 10017, message: "Segunda observación." },
        ],
      },
    },
  });

  await expect.element(dialog.getByText("Primera observación.")).toBeVisible();
  await expect.element(dialog.getByText("Segunda observación.")).toBeVisible();
});

test("asks where the error is, starting on the report, and says what correcting it does with the documents left unprocessed", async () => {
  const { dialog } = await renderModal(createServices());

  await expect
    .element(dialog.getByRole("radiogroup", { name: "¿Dónde está el error?" }))
    .toBeVisible();
  await expect.element(dialog.getByRole("radio", { name: "En el informe" })).toBeChecked();
  await expect.element(dialog.getByText("Coincide con lo impreso")).toBeVisible();
  await expect.element(dialog.getByText("Lo impreso está mal")).toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "Se corrige el informe y se vuelve a presentar con el mismo número. Los 12 comprobantes sin procesar se presentan aparte.",
      ),
    )
    .toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Cancelar" })).toBeVisible();
});

test.each([
  [
    1,
    "Se corrige el informe y se vuelve a presentar con el mismo número. El comprobante sin procesar se presenta aparte.",
  ],
  [0, "Se corrige el informe y se vuelve a presentar con el mismo número."],
])(
  "says what correcting does when %i documents were left unprocessed",
  async (unprocessed, notice) => {
    const { dialog } = await renderModal(createServices(), {
      target: { ...target, rejectedDocument: { ...rejectedDocument, unprocessed } },
    });

    await expect.element(dialog.getByText(notice, { exact: true })).toBeVisible();
  },
);

test("has no accessibility violations", async () => {
  const { dialog } = await renderModal(createServices());

  await expectNoAccessibilityViolations(dialog.element());
});

test("is closed without a rejected document to review", async () => {
  const screen = await render(
    <main>
      <ReviewRejectedDocumentModal
        target={null}
        onClose={() => {}}
        onRemedied={() => {}}
        onOutdated={() => {}}
        onSessionEnded={() => {}}
        services={createServices()}
      />
    </main>,
  );

  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("cancelling closes without calling the cloud", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const { dialog } = await renderModal(services, { onClose });

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(services.remedyRejectedDocument).not.toHaveBeenCalled();
});

test("reports the document as presented when the error is in the report, closes and tells what was recorded", async () => {
  const services = createServices();
  vi.mocked(services.remedyRejectedDocument).mockResolvedValue({ kind: "ok", value: recorded });
  const onClose = vi.fn();
  const onRemedied = vi.fn();
  const { dialog } = await renderModal(services, { onClose, onRemedied });

  await submitReport(dialog);

  await expect.poll(() => onRemedied.mock.calls.length).toBe(1);
  expect(onRemedied).toHaveBeenCalledWith(target, recorded);
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(services.remedyRejectedDocument).toHaveBeenCalledWith(reportRequest);
});

test("asks for the printed correction, with the printed values ready, when the error is in the printed document", async () => {
  const { dialog } = await renderModal(createServices());

  await chooseTheDocumentIsWrong(dialog);

  await expect
    .element(dialog.getByRole("radio", { name: "En el comprobante impreso" }))
    .toBeChecked();
  await expect.element(dialog.getByRole("textbox", { name: /^Total/ })).toHaveValue("18.450,00");
  await expect
    .element(dialog.getByRole("group", { name: /^Fecha/ }))
    .toHaveTextContent("09/09/2026");
  await expect.element(dialog.getByRole("radio", { name: "Consumidor final" })).toBeChecked();
  await expect
    .element(dialog.getByRole("textbox", { name: /^Condición frente al IVA/ }))
    .toHaveValue("5");
  await expect
    .element(
      dialog.getByText(
        "Se informa el comprobante con la corrección, con el mismo número, y se emite una nota de crédito por su total para anularlo. Los 12 comprobantes sin procesar se presentan aparte.",
      ),
    )
    .toBeVisible();
  await expect
    .element(dialog.getByRole("button", { name: "Corregir y anular con nota de crédito" }))
    .toBeVisible();
  expect(dialog.getByRole("button", { name: "Corregir el informe" }).query()).toBeNull();
});

test("asks for the CUIT only when the buyer is identified by one", async () => {
  const { dialog } = await renderModal(createServices());
  await chooseTheDocumentIsWrong(dialog);
  expect(dialog.getByRole("textbox", { name: /^CUIT del comprador/ }).query()).toBeNull();

  await userEvent.click(dialog.getByRole("radio", { name: "CUIT" }));

  await expect
    .element(dialog.getByRole("textbox", { name: /^CUIT del comprador/ }))
    .toHaveValue("");
});

test("corrects only what changed and closes when the correction is recorded", async () => {
  const services = createServices();
  vi.mocked(services.remedyRejectedDocument).mockResolvedValue({ kind: "ok", value: recorded });
  const onClose = vi.fn();
  const onRemedied = vi.fn();
  const { dialog } = await renderModal(services, { onClose, onRemedied });
  await chooseTheDocumentIsWrong(dialog);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Total/ }), "18.000,00");

  await submitPrinted(dialog);

  await expect.poll(() => onRemedied.mock.calls.length).toBe(1);
  expect(services.remedyRejectedDocument).toHaveBeenCalledWith({
    ...reportRequest,
    remedy: { kind: "printed", correction: { total: 1_800_000 } },
  });
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("corrects the date with the one typed", async () => {
  const services = createServices();
  vi.mocked(services.remedyRejectedDocument).mockResolvedValue({ kind: "ok", value: recorded });
  const onRemedied = vi.fn();
  const { dialog } = await renderModal(services, { onRemedied });
  await chooseTheDocumentIsWrong(dialog);
  await userEvent.click(
    dialog
      .getByRole("group", { name: /^Fecha/ })
      .getByRole("spinbutton")
      .first(),
  );
  await userEvent.keyboard("10092026");

  await submitPrinted(dialog);

  await expect.poll(() => onRemedied.mock.calls.length).toBe(1);
  expect(services.remedyRejectedDocument).toHaveBeenCalledWith({
    ...reportRequest,
    remedy: { kind: "printed", correction: { issued_on: "2026-09-10" } },
  });
});

test("corrects the buyer's identification and tax status", async () => {
  const services = createServices();
  vi.mocked(services.remedyRejectedDocument).mockResolvedValue({ kind: "ok", value: recorded });
  const onRemedied = vi.fn();
  const { dialog } = await renderModal(services, { onRemedied });
  await chooseTheDocumentIsWrong(dialog);
  await userEvent.click(dialog.getByRole("radio", { name: "CUIT" }));
  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^CUIT del comprador/ }),
    "20-00000001-5",
  );
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Condición frente al IVA/ }), "1");

  await submitPrinted(dialog);

  await expect.poll(() => onRemedied.mock.calls.length).toBe(1);
  expect(services.remedyRejectedDocument).toHaveBeenCalledWith({
    ...reportRequest,
    remedy: {
      kind: "printed",
      correction: {
        buyer_document_type: 80,
        buyer_document_number: 20_000_000_015,
        buyer_tax_status_code: 1,
      },
    },
  });
});

test("asks for the total before calling the cloud", async () => {
  const services = createServices();
  const { dialog } = await renderModal(services);
  await chooseTheDocumentIsWrong(dialog);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Total/ }), "");

  await submitPrinted(dialog);

  await expect.element(dialog.getByText("Ingresá el total del comprobante.")).toBeVisible();
  expect(services.remedyRejectedDocument).not.toHaveBeenCalled();
});

test("asks for the CUIT before calling the cloud", async () => {
  const services = createServices();
  const { dialog } = await renderModal(services);
  await chooseTheDocumentIsWrong(dialog);
  await userEvent.click(dialog.getByRole("radio", { name: "CUIT" }));

  await submitPrinted(dialog);

  await expect.element(dialog.getByText("Ingresá el CUIT del comprador.")).toBeVisible();
  expect(services.remedyRejectedDocument).not.toHaveBeenCalled();
});

test("asks for the passkey on authorization_required, then authorizes and retries", async () => {
  const services = createServices();
  vi.mocked(services.remedyRejectedDocument)
    .mockResolvedValueOnce({ kind: "authorization_required" })
    .mockResolvedValueOnce({ kind: "ok", value: recorded });
  const onRemedied = vi.fn();
  const { screen, dialog } = await renderModal(services, { onRemedied });

  await submitReport(dialog);
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect
    .element(
      authDialog.getByText(
        "Corregir el informe rechazado necesita tu autorización. Confirmala con tu passkey.",
      ),
    )
    .toBeVisible();
  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => vi.mocked(services.remedyRejectedDocument).mock.calls.length).toBe(2);
  await expect.poll(() => onRemedied.mock.calls.length).toBe(1);
});

test("says nothing changed when the cloud finds no difference with what was presented", async () => {
  const services = createServices();
  vi.mocked(services.remedyRejectedDocument).mockResolvedValue({
    kind: "correction_refused",
    refusal: "nothing_changed",
  });
  const onClose = vi.fn();
  const { dialog } = await renderModal(services, { onClose });
  await chooseTheDocumentIsWrong(dialog);

  await submitPrinted(dialog);

  await expect
    .element(dialog.getByText("No cambiaste ningún dato del comprobante.").first())
    .toBeVisible();
  expect(onClose).not.toHaveBeenCalled();
});

test.each([
  [
    "date_outside_fortnight",
    "Elegí una fecha dentro de la quincena del 1 al 15 de septiembre de 2026.",
  ],
  [
    "date_out_of_order",
    "La fecha no puede ser anterior a la del comprobante que le precede ni posterior a la del que le sigue.",
  ],
  ["invalid_total", "El total tiene que ser un importe mayor a cero."],
  [
    "invalid_buyer_identification",
    "Revisá el documento del comprador y su condición frente al IVA.",
  ],
] as const)(
  "shows the refusal %s under the field it is about, keeping the modal open",
  async (refusal, message) => {
    const services = createServices();
    vi.mocked(services.remedyRejectedDocument).mockResolvedValue({
      kind: "correction_refused",
      refusal,
    });
    const onClose = vi.fn();
    const { dialog } = await renderModal(services, { onClose });
    await chooseTheDocumentIsWrong(dialog);

    await submitPrinted(dialog);

    await expect.element(dialog.getByText(message)).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
  },
);

test("shows the field the cloud refused as invalid", async () => {
  const services = createServices();
  vi.mocked(services.remedyRejectedDocument).mockResolvedValue({
    kind: "validation_failed",
    field: "remedy.correction.total",
  });
  const { dialog } = await renderModal(services);
  await chooseTheDocumentIsWrong(dialog);

  await submitPrinted(dialog);

  await expect.element(dialog.getByText("Revisá el total.")).toBeVisible();
});

test.each([
  [{ kind: "not_found" }, "Este comprobante ya no está en el informe."],
  [{ kind: "not_rejected" }, "ARCA ya no tiene rechazado este comprobante."],
  [{ kind: "already_remedied" }, "Este comprobante ya se corrigió y espera volver a presentarse."],
] as const)("explains the outcome %j and asks the screen to refresh", async (outcome, message) => {
  const services = createServices();
  vi.mocked(services.remedyRejectedDocument).mockResolvedValue(outcome);
  const onOutdated = vi.fn();
  const onClose = vi.fn();
  const { dialog } = await renderModal(services, { onOutdated, onClose });

  await submitReport(dialog);

  await expect.element(dialog.getByText(message).first()).toBeVisible();
  expect(onOutdated).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();
});

test("shows the rate-limited notice", async () => {
  const services = createServices();
  vi.mocked(services.remedyRejectedDocument).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  const { dialog } = await renderModal(services);

  await submitReport(dialog);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("shows the attempt-failed notice", async () => {
  const services = createServices();
  vi.mocked(services.remedyRejectedDocument).mockResolvedValue({ kind: "failed" });
  const { dialog } = await renderModal(services);

  await submitReport(dialog);

  await expect.element(dialog.getByText("No se pudo corregir el informe")).toBeVisible();
  await expect.element(dialog.getByText("Probá de nuevo.")).toBeVisible();
});

test("ends the session when the cloud no longer knows it", async () => {
  const services = createServices();
  vi.mocked(services.remedyRejectedDocument).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal(services, { onSessionEnded });

  await submitReport(dialog);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
