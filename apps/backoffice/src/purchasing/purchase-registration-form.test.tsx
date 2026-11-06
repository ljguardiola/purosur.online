import { purchaseRegistrationBodySchema } from "@purosur/contracts";
import { ANOTHER_FICTIONAL_CUIT, FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { StubProductCreationModal } from "../platform/test-support/creation-parts";
import { OUTDATED_TAB_ADVICE, openAsOutdatedTab } from "../platform/test-support/release-monitor";
import type { CloudData } from "../platform/use-cloud-query";
import type { BackofficeAccess } from "../shell/backoffice-access";
import { ADMINISTRATOR_ACCESS, accessWith } from "../shell/test-support/backoffice-access";
import { render } from "../shell/test-support/render-with-router";
import { emptyPurchaseForm, purchaseRegistrationRequestFrom } from "./purchase-form";
import { PurchaseRegistrationForm, type PurchaseSubmitOutcome } from "./purchase-registration-form";
import { AVENA_PRODUCT_ID } from "./test-support/purchase-products";
import { purchaseChoicesFrom } from "./test-support/purchases";
import { suppliersWithCuits } from "./test-support/suppliers";

const { andina, granos } = suppliersWithCuits(FICTIONAL_CUIT, ANOTHER_FICTIONAL_CUIT);
const purchaseChoices = purchaseChoicesFrom([andina, granos]);
type PurchaseChoices = typeof purchaseChoices;

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

type FormOptions = {
  data?: CloudData<PurchaseChoices>;
  access?: BackofficeAccess;
  supplier?: { kind: "fixed"; name: string };
  submit?: (parsed: unknown) => Promise<PurchaseSubmitOutcome>;
  onSubmitted?: () => void;
  onCancel?: () => void;
  onSessionEnded?: () => void;
};

function renderForm({
  data = { status: "loaded", value: purchaseChoices, refreshing: false },
  access = ADMINISTRATOR_ACCESS,
  supplier,
  submit = vi.fn(),
  onSubmitted = () => {},
  onCancel = () => {},
  onSessionEnded = () => {},
}: FormOptions = {}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <PurchaseRegistrationForm
          access={access}
          productCreationModal={StubProductCreationModal}
          eyebrow="Compras"
          title="Cargar la compra"
          submitLabel="Guardar la compra"
          failureTitle="No se guardó la compra"
          loadingWhat="la carga de la compra"
          data={data}
          initialValues={emptyPurchaseForm(null)}
          supplier={supplier ?? { kind: "choose", services: { createSupplier: vi.fn() } }}
          request={{
            schema: purchaseRegistrationBodySchema,
            from: purchaseRegistrationRequestFrom,
          }}
          submit={submit}
          onSubmitted={onSubmitted}
          onCancel={onCancel}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>,
  );
}

type Form = Awaited<ReturnType<typeof renderForm>>;
type Scope = Pick<Form, "getByRole">;

async function opened(options: FormOptions = {}) {
  const form = await renderForm(options);
  await expect.element(form.getByRole("combobox", { name: /^Proveedor/ })).toBeVisible();
  return form;
}

// A locator click scrolls the option into view first, and the scroll event closes the list.
async function chooseFromComboBox(form: Form, scope: Scope, label: RegExp, name: string) {
  await userEvent.click(scope.getByRole("combobox", { name: label }));
  await expect.element(form.getByRole("option", { name })).toBeVisible();
  (form.getByRole("option", { name }).element() as HTMLElement).click();
}

async function chooseFromSelect(form: Form, scope: Scope, label: RegExp, name: string) {
  await userEvent.click(scope.getByRole("button", { name: label }));
  await userEvent.click(form.getByRole("option", { name }));
}

function line(form: Form, number: number) {
  return form.getByRole("group", { name: `Línea ${number}` });
}

async function fillHeader(form: Form) {
  await chooseFromComboBox(form, form, /^Proveedor/, "Granos del Valle");
  await chooseFromSelect(form, form, /Tipo de comprobante/, "Sin comprobante");
}

async function fillQuantityLine(form: Form, number = 1) {
  const group = line(form, number);
  await chooseFromComboBox(form, group, /^Producto/, "Avena arrollada");
  await userEvent.fill(group.getByRole("textbox", { name: /^Cantidad/ }), "12,5");
  await userEvent.fill(group.getByRole("textbox", { name: /^Costo por kg/ }), "2.000");
}

async function submitForm(form: Form) {
  await userEvent.click(form.getByRole("button", { name: "Guardar la compra" }));
}

function purchaseDateSegments(form: Form) {
  return form
    .getByRole("group", { name: /^Fecha de compra/ })
    .getByRole("spinbutton")
    .all()
    .map((segment) => segment.element().textContent);
}

test("shows the eyebrow and heading it is given, with the day the choices answer as the purchase date", async () => {
  const form = await opened();

  await expect.element(form.getByText("Compras").first()).toBeVisible();
  await expect
    .element(form.getByRole("heading", { name: "Cargar la compra", level: 1 }))
    .toBeVisible();
  expect(purchaseDateSegments(form)).toEqual(["16", "9", "2026"]);
});

test("shows a fixed supplier by its name, with no supplier to choose", async () => {
  const form = await renderForm({ supplier: { kind: "fixed", name: "Distribuidora Andina" } });

  await expect.element(form.getByText("Distribuidora Andina")).toBeVisible();
  expect(form.getByRole("combobox", { name: /^Proveedor/ }).query()).toBeNull();
});

test("says there is no supplier to choose to a person who cannot create one, keeping the submit action disabled", async () => {
  const form = await renderForm({
    data: { status: "loaded", value: { ...purchaseChoices, suppliers: [] }, refreshing: false },
    access: accessWith("purchases", "stock_area"),
  });

  await expect.element(form.getByText("No hay proveedores activos")).toBeVisible();
  expect(form.getByRole("combobox", { name: /^Proveedor/ }).query()).toBeNull();
  await expect.element(form.getByRole("button", { name: "Guardar la compra" })).toBeDisabled();
});

test("says there is no product to buy to a person who cannot create one, keeping the submit action disabled", async () => {
  const form = await renderForm({
    data: { status: "loaded", value: { ...purchaseChoices, products: [] }, refreshing: false },
    access: accessWith("purchases", "suppliers"),
  });

  await expect.element(form.getByText("No hay productos activos")).toBeVisible();
  await expect.element(form.getByRole("button", { name: "Guardar la compra" })).toBeDisabled();
});

test("submits the request built from what was typed and hands back the typed values", async () => {
  const submit = vi.fn().mockResolvedValue({ kind: "ok" });
  const onSubmitted = vi.fn();
  const form = await opened({ submit, onSubmitted });
  await fillHeader(form);
  await fillQuantityLine(form);

  await submitForm(form);

  expect(submit).toHaveBeenCalledWith(
    expect.objectContaining({
      supplierId: granos.id,
      receiptType: "sin_comprobante",
      lines: [
        {
          loadedBy: "quantity",
          productId: AVENA_PRODUCT_ID,
          quantity: 12_500,
          costPaidCents: 200_000,
          expiresOn: null,
        },
      ],
    }),
  );
  await expect.poll(() => onSubmitted.mock.calls.length).toBe(1);
  expect(onSubmitted.mock.calls[0]?.[0]).toMatchObject({ supplierId: granos.id });
});

test("says what is missing, at its field, without submitting", async () => {
  const submit = vi.fn();
  const form = await opened({ submit });

  await submitForm(form);

  await expect.element(form.getByText("Elegí el proveedor.")).toBeVisible();
  await expect.element(form.getByText("Elegí el tipo de comprobante.")).toBeVisible();
  await expect.element(form.getByText("Línea 1: Elegí el producto.")).toBeVisible();
  expect(submit).not.toHaveBeenCalled();
});

test("asks for the receipt number of a receipt, and refuses one without a receipt", async () => {
  const form = await opened();
  await chooseFromComboBox(form, form, /^Proveedor/, "Granos del Valle");
  await fillQuantityLine(form);
  await chooseFromSelect(form, form, /Tipo de comprobante/, "Factura B");

  await submitForm(form);
  await expect.element(form.getByText("Ingresá el número del comprobante.")).toBeVisible();

  await chooseFromSelect(form, form, /Tipo de comprobante/, "Sin comprobante");
  await userEvent.fill(form.getByRole("textbox", { name: /^Número de comprobante/ }), "1");
  await expect.element(form.getByText("Una compra sin comprobante no lleva número.")).toBeVisible();
});

test("shows the cloud's refusal of a purchase dated after today", async () => {
  const onSubmitted = vi.fn();
  const form = await opened({
    submit: vi.fn().mockResolvedValue({ kind: "validation_failed", field: "purchasedOn" }),
    onSubmitted,
  });
  await fillHeader(form);
  await fillQuantityLine(form);

  await submitForm(form);

  await expect
    .element(form.getByText("La fecha de compra no puede ser posterior a hoy."))
    .toBeVisible();
  expect(onSubmitted).not.toHaveBeenCalled();
});

test("shows a refusal it is handed with its title and description, and stays on the form", async () => {
  const onSubmitted = vi.fn();
  const form = await opened({
    submit: vi.fn().mockResolvedValue({
      kind: "refused",
      title: "Este pedido ya no se puede recibir",
      description: "Volvé al pedido para ver su estado.",
    }),
    onSubmitted,
  });
  await fillHeader(form);
  await fillQuantityLine(form);

  await submitForm(form);

  await expect.element(form.getByText("Este pedido ya no se puede recibir")).toBeVisible();
  await expect.element(form.getByText("Volvé al pedido para ver su estado.")).toBeVisible();
  expect(onSubmitted).not.toHaveBeenCalled();
});

test.each([
  ["product_not_found", "Este producto ya no está disponible."],
  ["product_inactive", "Este producto ya no está activo."],
] as const)("shows the cloud's %s refusal at the line it names", async (reason, message) => {
  const form = await opened({
    submit: vi.fn().mockResolvedValue({ kind: "line_refused", reason, lineIndex: 1 }),
  });
  await fillHeader(form);
  await fillQuantityLine(form);
  await userEvent.click(form.getByRole("button", { name: "Agregar línea" }));
  await fillQuantityLine(form, 2);

  await submitForm(form);

  await expect.element(line(form, 2).getByText(message).first()).toBeVisible();
  expect(line(form, 1).getByText(message).query()).toBeNull();
});

test("shows how to type the quantity at the line the cloud refused it", async () => {
  const form = await opened({
    submit: vi.fn().mockResolvedValue({ kind: "validation_failed", field: "lines", lineIndex: 0 }),
  });
  await fillHeader(form);
  await fillQuantityLine(form);

  await submitForm(form);

  await expect
    .element(
      line(form, 1)
        .getByText("Escribí los kilos con hasta 3 decimales, por ejemplo 12,150.")
        .first(),
    )
    .toBeVisible();
});

test("clears a line's refusal once the person changes that line", async () => {
  const form = await opened({
    submit: vi
      .fn()
      .mockResolvedValue({ kind: "line_refused", reason: "product_inactive", lineIndex: 0 }),
  });
  await fillHeader(form);
  await fillQuantityLine(form);
  await submitForm(form);
  await expect.element(form.getByText("Este producto ya no está activo.").first()).toBeVisible();

  await chooseFromComboBox(form, line(form, 1), /^Producto/, "Miel pura de abeja 1 kg");

  await expect.poll(() => form.getByText("Este producto ya no está activo.").query()).toBeNull();
});

test("clears a line's refusal when the form is submitted again", async () => {
  const submit = vi
    .fn()
    .mockResolvedValueOnce({ kind: "line_refused", reason: "product_inactive", lineIndex: 0 })
    .mockReturnValueOnce(new Promise(() => {}));
  const form = await opened({ submit });
  await fillHeader(form);
  await fillQuantityLine(form);
  await submitForm(form);
  await expect.element(form.getByText("Este producto ya no está activo.").first()).toBeVisible();

  await submitForm(form);

  await expect.poll(() => form.getByText("Este producto ya no está activo.").query()).toBeNull();
});

test("shows the failure it is given when submitting fails, and stays on the form", async () => {
  const onSubmitted = vi.fn();
  const form = await opened({ submit: vi.fn().mockResolvedValue({ kind: "failed" }), onSubmitted });
  await fillHeader(form);
  await fillQuantityLine(form);

  await submitForm(form);

  await expect.element(form.getByText("No se guardó la compra")).toBeVisible();
  await expect.element(form.getByText("Volvé a intentarlo.")).toBeVisible();
  expect(onSubmitted).not.toHaveBeenCalled();
});

test("tells an outdated tab to reload because the backoffice was updated when submitting fails", async () => {
  openAsOutdatedTab();
  const form = await opened({ submit: vi.fn().mockResolvedValue({ kind: "failed" }) });
  await fillHeader(form);
  await fillQuantityLine(form);

  await submitForm(form);

  await expect.element(form.getByText("No se guardó la compra")).toBeVisible();
  await expect.element(form.getByText(OUTDATED_TAB_ADVICE)).toBeVisible();
  expect(form.getByText("Volvé a intentarlo.").query()).toBeNull();
});

test("shows the time to wait when the cloud rate-limits the submission", async () => {
  const form = await opened({
    submit: vi.fn().mockResolvedValue({ kind: "rate_limited", retryAfterSeconds: 120 }),
  });
  await fillHeader(form);
  await fillQuantityLine(form);

  await submitForm(form);

  await expect.element(form.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(form.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("sends the person to Mi cuenta when the submission is forbidden, and ends the session when it finds none", async () => {
  const submit = vi.fn().mockResolvedValueOnce({ kind: "forbidden" });
  const onSessionEnded = vi.fn();
  const form = await opened({ submit, onSessionEnded });
  await fillHeader(form);
  await fillQuantityLine(form);

  await submitForm(form);
  await expect
    .poll(() => window.location.pathname + window.location.search)
    .toBe("/?account=credentials");

  submit.mockResolvedValueOnce({ kind: "unauthenticated" });
  await submitForm(form);
  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("Cancelar hands the cancellation back", async () => {
  const onCancel = vi.fn();
  const form = await opened({ onCancel });

  await userEvent.click(form.getByRole("button", { name: "Cancelar" }));

  expect(onCancel).toHaveBeenCalledTimes(1);
});

test("keeps the submit action disabled, with no fields, while the choices load", async () => {
  const form = await renderForm({ data: { status: "loading" } });

  await expect.element(form.getByRole("button", { name: "Guardar la compra" })).toBeDisabled();
  expect(form.getByRole("combobox", { name: /^Proveedor/ }).query()).toBeNull();
});

test("shows a load error naming what it loads, whose retry loads the choices again, keeping the submit action disabled", async () => {
  const retry = vi.fn();
  const form = await renderForm({ data: { status: "failed", retry } });

  await expect.element(form.getByText("No pudimos abrir la carga de la compra")).toBeVisible();
  await expect.element(form.getByRole("button", { name: "Guardar la compra" })).toBeDisabled();
  await userEvent.click(form.getByRole("button", { name: "Reintentar" }));
  expect(retry).toHaveBeenCalledTimes(1);
});

test("has no accessibility violations once loaded", async () => {
  const form = await opened();

  await expectNoAccessibilityViolations(form.container);
});
