import { formatCalendarDayRange } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { CloudData } from "../platform/use-cloud-query";
import type { FortnightPresentation, RejectedDocument } from "./fortnight-presentations-api";
import { FortnightReportsSection } from "./fortnight-reports-section";
import type { RegisterPointOfSale } from "./register-points-of-sale-api";
import type { RemedyTarget } from "./rejected-document-remedy-form";

const register: RegisterPointOfSale = {
  registerId: "register-1",
  registerName: "Caja 1",
  pointOfSaleNumber: 3,
  fiscalAddressId: null,
  version: 1,
  offlinePointOfSaleNumber: 4,
  offlineVersion: 1,
};

const secondRegister: RegisterPointOfSale = {
  ...register,
  registerId: "register-2",
  registerName: "Caja 2",
  offlinePointOfSaleNumber: 5,
};

const septemberFirstHalf = { start: "2026-09-01", end: "2026-09-15" };
const augustSecondHalf = { start: "2026-08-16", end: "2026-08-31" };

function presentation(overrides: Partial<FortnightPresentation> = {}): FortnightPresentation {
  return {
    registerId: register.registerId,
    pointOfSaleNumber: 4,
    fortnight: septemberFirstHalf,
    deadline: "2026-09-23",
    documentType: null,
    documentCount: 0,
    rejectedDocument: null,
    movement: null,
    refusal: null,
    state: null,
    ...overrides,
  };
}

function loaded(
  presentations: FortnightPresentation[],
  registers: RegisterPointOfSale[] = [register, secondRegister],
): CloudData<[FortnightPresentation[], RegisterPointOfSale[]]> {
  return { status: "loaded", value: [presentations, registers], refreshing: false };
}

function sectionFor(
  data: CloudData<[FortnightPresentation[], RegisterPointOfSale[]]>,
  onReview: (target: RemedyTarget) => void = () => {},
) {
  return (
    <main>
      <FortnightReportsSection data={data} onReview={onReview} />
    </main>
  );
}

function rejectedDocument(overrides: Partial<RejectedDocument> = {}): RejectedDocument {
  return {
    number: 298,
    unprocessed: 12,
    issuedOn: "2026-09-09",
    total: 1_845_000,
    buyer: { kind: "final_consumer" },
    buyerTaxStatusCode: 5,
    rejections: [{ code: 10016, message: "Fictional observation" }],
    remedy: "awaiting_remedy",
    ...overrides,
  };
}

function partlyRejected(overrides: Partial<FortnightPresentation> = {}): FortnightPresentation {
  return presentation({
    documentType: "factura_c",
    movement: "documents",
    documentCount: 20,
    state: "refused",
    refusal: "partial",
    rejectedDocument: rejectedDocument(),
    ...overrides,
  });
}

test("lists each presentation with its fortnight, its point of sale, its document type, its documents, its state and its deadline", async () => {
  const screen = await render(
    sectionFor(
      loaded([
        presentation({
          fortnight: augustSecondHalf,
          deadline: "2026-09-08",
          documentType: "factura_c",
          movement: "documents",
          documentCount: 51,
          state: "accepted",
        }),
      ]),
    ),
  );

  const table = screen.getByRole("table", { name: "Informes quincenales" });
  for (const header of ["Quincena", "Punto de venta", "Tipo", "Comprobantes", "Estado", "Vence"]) {
    await expect.element(table.getByRole("columnheader", { name: header })).toBeVisible();
  }
  await expect
    .element(table.getByText(formatCalendarDayRange("2026-08-16", "2026-08-31"), { exact: true }))
    .toBeVisible();
  await expect.element(table.getByText("00004")).toBeVisible();
  await expect.element(table.getByText("Factura C")).toBeVisible();
  await expect.element(table.getByText("51 comprobantes")).toBeVisible();
  await expect.element(table.getByText("Aceptado")).toBeVisible();
  await expect.element(table.getByText("08/09/2026")).toBeVisible();
});

test("lists a row per document type of the same point of sale and fortnight", async () => {
  const screen = await render(
    sectionFor(
      loaded([
        presentation({
          documentType: "factura_c",
          movement: "documents",
          documentCount: 2,
          state: "accepted",
        }),
        presentation({ documentType: null, movement: "none", documentCount: 0, state: "accepted" }),
      ]),
    ),
  );

  const table = screen.getByRole("table", { name: "Informes quincenales" });
  await expect.element(table.getByText("2 comprobantes")).toBeVisible();
  await expect.element(table.getByText("Sin movimiento")).toBeVisible();
  await expect.element(table.getByText("Factura C")).toBeVisible();
  expect(table.getByRole("row").elements()).toHaveLength(3);
});

test("warns above the table of each blocked presentation which register still has to finish syncing", async () => {
  const screen = await render(
    sectionFor(
      loaded([
        presentation({ state: "blocked" }),
        presentation({
          registerId: secondRegister.registerId,
          pointOfSaleNumber: 5,
          fortnight: augustSecondHalf,
          state: "blocked",
        }),
      ]),
    ),
  );

  await expect
    .element(screen.getByText("Caja 1 todavía no terminó de sincronizar", { exact: true }))
    .toBeVisible();
  await expect
    .element(
      screen.getByText(
        `El informe ${formatCalendarDayRange("2026-09-01", "2026-09-15")} del punto de venta 00004 se puede presentar cuando termine.`,
        { exact: true },
      ),
    )
    .toBeVisible();
  await expect
    .element(screen.getByText("Caja 2 todavía no terminó de sincronizar", { exact: true }))
    .toBeVisible();
  await expect
    .element(
      screen.getByText(
        `El informe ${formatCalendarDayRange("2026-08-16", "2026-08-31")} del punto de venta 00005 se puede presentar cuando termine.`,
        { exact: true },
      ),
    )
    .toBeVisible();
  expect(screen.getByText(/No se puede presentar/).query()).toBeNull();
});

test("shows no warning while no presentation is blocked, even when one is missing a document", async () => {
  const screen = await render(
    sectionFor(
      loaded([
        presentation({ state: "refused" }),
        presentation({ state: "accepted" }),
        presentation({ fortnight: augustSecondHalf, state: "missing_document" }),
      ]),
    ),
  );

  await expect.element(screen.getByRole("table")).toBeVisible();
  expect(screen.getByText(/terminó de sincronizar/).query()).toBeNull();
});

test("shows the empty state when no fortnight has closed", async () => {
  const screen = await render(sectionFor(loaded([])));

  await expect.element(screen.getByText("Todavía no hay informes quincenales")).toBeVisible();
  await expect
    .element(
      screen.getByText("Aparecen cuando cierra la primera quincena con un punto de venta CAEA."),
    )
    .toBeVisible();
});

test("shows a placeholder while the presentations load", async () => {
  const screen = await render(sectionFor({ status: "loading" }));

  await expect
    .element(screen.getByRole("table", { name: "Informes quincenales" }))
    .toHaveAttribute("aria-busy", "true");
});

test("shows a load failure, and Reintentar asks again", async () => {
  const retry = vi.fn();
  const screen = await render(sectionFor({ status: "failed", retry }));
  await expect.element(screen.getByText("No pudimos abrir los informes quincenales")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  expect(retry).toHaveBeenCalledOnce();
});

test("has no accessibility violations with blocked and accepted presentations", async () => {
  const screen = await render(
    sectionFor(loaded([presentation({ state: "blocked" }), presentation({ state: "accepted" })])),
  );

  await expect.element(screen.getByRole("table")).toBeVisible();
  await expectNoAccessibilityViolations(document.body);
});

test("warns above the table of each presentation with a rejected document that waits for its remedy", async () => {
  const screen = await render(
    sectionFor(
      loaded([
        partlyRejected(),
        partlyRejected({ pointOfSaleNumber: 5, fortnight: augustSecondHalf }),
      ]),
    ),
  );

  await expect
    .element(
      screen.getByText(
        `ARCA rechazó un comprobante del informe ${formatCalendarDayRange("2026-09-01", "2026-09-15")} del punto de venta 00004`,
        { exact: true },
      ),
    )
    .toBeVisible();
  await expect
    .element(
      screen.getByText(
        `ARCA rechazó un comprobante del informe ${formatCalendarDayRange("2026-08-16", "2026-08-31")} del punto de venta 00005`,
        { exact: true },
      ),
    )
    .toBeVisible();
  expect(
    screen.getByText("Hay que revisar dónde está el error antes de volver a presentar.").elements(),
  ).toHaveLength(2);
});

test("shows no rejection warning for a corrected document that waits to be resent, and badges it", async () => {
  const screen = await render(
    sectionFor(
      loaded([
        partlyRejected({ rejectedDocument: rejectedDocument({ remedy: "awaiting_resend" }) }),
      ]),
    ),
  );

  const table = screen.getByRole("table", { name: "Informes quincenales" });
  await expect.element(table.getByText("Corregido, por reenviar")).toBeVisible();
  expect(screen.getByText(/ARCA rechazó un comprobante/).query()).toBeNull();
});

test("lists a rejected document with its count of unprocessed ones and the badge of a partial rejection", async () => {
  const screen = await render(sectionFor(loaded([partlyRejected()])));

  const table = screen.getByRole("table", { name: "Informes quincenales" });
  await expect.element(table.getByText("1 rechazado · 12 sin procesar")).toBeVisible();
  await expect.element(table.getByText("Rechazado en parte")).toBeVisible();
});

test("offers to review the rejection of a document that waits for its remedy, handing over what the modal needs", async () => {
  const onReview = vi.fn();
  const screen = await render(sectionFor(loaded([partlyRejected()]), onReview));

  await userEvent.click(
    screen.getByRole("button", {
      name: `Revisar el rechazo del informe ${formatCalendarDayRange("2026-09-01", "2026-09-15")} del punto de venta 00004`,
    }),
  );

  expect(onReview).toHaveBeenCalledWith({
    pointOfSaleNumber: 4,
    fortnight: septemberFirstHalf,
    rejectedDocument: rejectedDocument(),
  });
});

test("offers no review for a presentation that is not waiting for a remedy", async () => {
  const screen = await render(
    sectionFor(
      loaded([
        partlyRejected({ rejectedDocument: rejectedDocument({ remedy: "awaiting_resend" }) }),
        presentation({ fortnight: augustSecondHalf, state: "accepted" }),
      ]),
    ),
  );

  await expect.element(screen.getByRole("table")).toBeVisible();
  expect(screen.getByRole("button", { name: /Revisar el rechazo/ }).query()).toBeNull();
});

test("has no accessibility violations with a rejected document waiting for its remedy", async () => {
  const screen = await render(sectionFor(loaded([partlyRejected()])));

  await expect.element(screen.getByRole("table")).toBeVisible();
  await expectNoAccessibilityViolations(document.body);
});
