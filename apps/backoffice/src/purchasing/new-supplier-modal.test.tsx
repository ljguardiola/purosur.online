import type { SupplierSummary } from "@purosur/contracts";
import { ANOTHER_FICTIONAL_CUIT, FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import { FieldSizeProvider } from "@purosur/ui";
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { NewSupplierModal, type NewSupplierModalServices } from "./new-supplier-modal";
import { suppliersWithCuits } from "./test-support/suppliers";

const { andina } = suppliersWithCuits(FICTIONAL_CUIT, ANOTHER_FICTIONAL_CUIT);

afterEach(() => {
  window.history.pushState(null, "", "/");
});

function renderModal({
  createSupplier = vi.fn<NewSupplierModalServices["createSupplier"]>(),
  onCreated = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: {
  createSupplier?: NewSupplierModalServices["createSupplier"];
  onCreated?: (supplier: SupplierSummary) => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
} = {}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <NewSupplierModal
          open
          services={{ createSupplier }}
          onCreated={onCreated}
          onClose={onClose}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>,
  );
}

type ModalScreen = Awaited<ReturnType<typeof renderModal>>;

async function submit(
  screen: ModalScreen,
  fields: { name?: string; cuit?: string; contact?: string; note?: string } = {},
) {
  const dialog = screen.getByRole("dialog");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), fields.name ?? "Granos");
  await userEvent.fill(dialog.getByRole("textbox", { name: "CUIT" }), fields.cuit ?? "");
  await userEvent.fill(dialog.getByRole("textbox", { name: "Contacto" }), fields.contact ?? "");
  await userEvent.fill(dialog.getByRole("textbox", { name: "Nota" }), fields.note ?? "");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el proveedor" }));
  return dialog;
}

test("shows the eyebrow, the title and the four fields, only the name required", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");

  await expect.element(dialog.getByText("Stock · Proveedores")).toBeVisible();
  await expect.element(dialog.getByRole("heading", { name: "Nuevo proveedor" })).toBeVisible();
  await expect.element(dialog.getByRole("textbox", { name: /^Nombre/ })).toBeVisible();
  await expect.element(dialog.getByRole("textbox", { name: "CUIT" })).toBeVisible();
  await expect.element(dialog.getByRole("textbox", { name: "Contacto" })).toBeVisible();
  await expect.element(dialog.getByRole("textbox", { name: "Nota" })).toBeVisible();
});

test("creates the supplier with every field trimmed and hands the created supplier over", async () => {
  const createSupplier = vi
    .fn<NewSupplierModalServices["createSupplier"]>()
    .mockResolvedValue({ kind: "ok", supplier: andina });
  const onCreated = vi.fn();
  const screen = await renderModal({ createSupplier, onCreated });

  await submit(screen, {
    name: "  Distribuidora Andina ",
    cuit: ` ${FICTIONAL_CUIT} `,
    contact: " Marta ",
    note: " Entrega los martes ",
  });

  expect(createSupplier).toHaveBeenCalledWith({
    name: "Distribuidora Andina",
    cuit: FICTIONAL_CUIT,
    contact: "Marta",
    note: "Entrega los martes",
  });
  await expect.poll(() => onCreated.mock.calls).toEqual([[andina]]);
});

test("creates a supplier with only a name", async () => {
  const createSupplier = vi
    .fn<NewSupplierModalServices["createSupplier"]>()
    .mockResolvedValue({ kind: "ok", supplier: andina });
  const screen = await renderModal({ createSupplier });

  await submit(screen, { name: "Granos" });

  expect(createSupplier).toHaveBeenCalledWith({ name: "Granos", cuit: "", contact: "", note: "" });
});

test("refuses a missing name, a malformed CUIT and texts over their limits without calling the API", async () => {
  const createSupplier = vi.fn<NewSupplierModalServices["createSupplier"]>();
  const screen = await renderModal({ createSupplier });

  const dialog = await submit(screen, {
    name: "",
    cuit: "123",
    contact: "a".repeat(201),
    note: "a".repeat(201),
  });

  await expect.element(dialog.getByText("Ingresá el nombre del proveedor.")).toBeVisible();
  await expect
    .element(dialog.getByText("Ingresá un CUIT válido, con el formato NN-NNNNNNNN-N."))
    .toBeVisible();
  await expect
    .element(dialog.getByText("El contacto puede tener hasta 200 caracteres."))
    .toBeVisible();
  await expect.element(dialog.getByText("La nota puede tener hasta 200 caracteres.")).toBeVisible();
  expect(createSupplier).not.toHaveBeenCalled();
});

test("shows a name another supplier has under the name field", async () => {
  const createSupplier = vi
    .fn<NewSupplierModalServices["createSupplier"]>()
    .mockResolvedValue({ kind: "name_taken" });
  const screen = await renderModal({ createSupplier });

  const dialog = await submit(screen);

  await expect.element(dialog.getByText("Ya existe un proveedor con ese nombre.")).toBeVisible();
});

test("shows a CUIT another supplier has under the CUIT field", async () => {
  const createSupplier = vi
    .fn<NewSupplierModalServices["createSupplier"]>()
    .mockResolvedValue({ kind: "cuit_taken" });
  const screen = await renderModal({ createSupplier });

  const dialog = await submit(screen, { cuit: FICTIONAL_CUIT });

  await expect.element(dialog.getByText("Ya existe un proveedor con ese CUIT.")).toBeVisible();
});

test("shows a field the cloud refused under that field", async () => {
  const createSupplier = vi
    .fn<NewSupplierModalServices["createSupplier"]>()
    .mockResolvedValue({ kind: "validation_failed", field: "cuit" });
  const screen = await renderModal({ createSupplier });

  const dialog = await submit(screen, { cuit: FICTIONAL_CUIT });

  await expect
    .element(dialog.getByText("Ingresá un CUIT válido, con el formato NN-NNNNNNNN-N."))
    .toBeVisible();
});

test("shows the failure notice", async () => {
  const createSupplier = vi
    .fn<NewSupplierModalServices["createSupplier"]>()
    .mockResolvedValue({ kind: "failed" });
  const screen = await renderModal({ createSupplier });

  const dialog = await submit(screen);

  await expect.element(dialog.getByText("No se guardó el proveedor")).toBeVisible();
  await expect.element(dialog.getByText("Volvé a intentarlo.")).toBeVisible();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const createSupplier = vi.fn<NewSupplierModalServices["createSupplier"]>().mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 60,
  });
  const screen = await renderModal({ createSupplier });

  const dialog = await submit(screen);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
});

test("ends the session when saving finds no open session", async () => {
  const createSupplier = vi
    .fn<NewSupplierModalServices["createSupplier"]>()
    .mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ createSupplier, onSessionEnded });

  await submit(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when saving comes back forbidden", async () => {
  window.history.pushState(null, "", "/suppliers");
  const createSupplier = vi
    .fn<NewSupplierModalServices["createSupplier"]>()
    .mockResolvedValue({ kind: "forbidden" });
  const screen = await renderModal({ createSupplier });

  await submit(screen);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("cancel closes the modal without calling the API", async () => {
  const createSupplier = vi.fn<NewSupplierModalServices["createSupplier"]>();
  const onClose = vi.fn();
  const screen = await renderModal({ createSupplier, onClose });

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(createSupplier).not.toHaveBeenCalled();
});
