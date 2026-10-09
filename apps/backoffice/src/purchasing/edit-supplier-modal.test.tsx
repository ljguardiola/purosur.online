import type { SupplierSummary } from "@purosur/contracts";
import { FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import { FieldSizeProvider } from "@purosur/ui";
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { EditSupplierModal, type EditSupplierModalServices } from "./edit-supplier-modal";
import type { SupplierReload } from "./purchasing-queries";
import { andina, granos } from "./test-support/suppliers";

afterEach(() => {
  window.history.pushState(null, "", "/");
});

function renderModal({
  target = andina,
  editSupplier = vi.fn<EditSupplierModalServices["editSupplier"]>(),
  reload = vi.fn<(id: string) => Promise<SupplierReload>>(),
  onSaved = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: {
  target?: SupplierSummary;
  editSupplier?: EditSupplierModalServices["editSupplier"];
  reload?: (id: string) => Promise<SupplierReload>;
  onSaved?: () => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
} = {}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <EditSupplierModal
          target={target}
          onClose={onClose}
          onSaved={onSaved}
          onSessionEnded={onSessionEnded}
          reload={reload}
          services={{ editSupplier }}
        />
      </main>
    </FieldSizeProvider>,
  );
}

type ModalScreen = Awaited<ReturnType<typeof renderModal>>;

async function save(screen: ModalScreen, name?: string) {
  const dialog = screen.getByRole("dialog");
  if (name !== undefined) {
    await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), name);
  }
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  return dialog;
}

test("opens titled with the supplier's name and filled with its data", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");

  await expect.element(dialog.getByText("Stock · Proveedores")).toBeVisible();
  await expect.element(dialog.getByRole("heading", { name: "Distribuidora Andina" })).toBeVisible();
  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Distribuidora Andina");
  await expect.element(dialog.getByRole("textbox", { name: "CUIT" })).toHaveValue(FICTIONAL_CUIT);
  await expect
    .element(dialog.getByRole("textbox", { name: "Contacto" }))
    .toHaveValue("Marta Pérez · 11 5555-0100");
  await expect
    .element(dialog.getByRole("textbox", { name: "Nota" }))
    .toHaveValue("Entrega los martes");
});

test("opens a supplier without a CUIT, contact or note with those fields empty", async () => {
  const screen = await renderModal({ target: granos });
  const dialog = screen.getByRole("dialog");

  await expect.element(dialog.getByRole("textbox", { name: "CUIT" })).toHaveValue("");
  await expect.element(dialog.getByRole("textbox", { name: "Contacto" })).toHaveValue("");
  await expect.element(dialog.getByRole("textbox", { name: "Nota" })).toHaveValue("");
});

test("saves the changes with the fields trimmed and the version it opened at", async () => {
  const editSupplier = vi
    .fn<EditSupplierModalServices["editSupplier"]>()
    .mockResolvedValue({ kind: "ok" });
  const onSaved = vi.fn();
  const screen = await renderModal({ editSupplier, onSaved });

  await save(screen, " Andina Mayorista ");

  expect(editSupplier).toHaveBeenCalledWith(andina.id, {
    name: "Andina Mayorista",
    cuit: FICTIONAL_CUIT,
    contact: "Marta Pérez · 11 5555-0100",
    note: "Entrega los martes",
    version: 1,
  });
  await expect.poll(() => onSaved.mock.calls.length).toBe(1);
});

test("clearing the CUIT sends it empty", async () => {
  const editSupplier = vi
    .fn<EditSupplierModalServices["editSupplier"]>()
    .mockResolvedValue({ kind: "ok" });
  const screen = await renderModal({ editSupplier });
  await userEvent.fill(screen.getByRole("dialog").getByRole("textbox", { name: "CUIT" }), "");

  await save(screen);

  expect(editSupplier).toHaveBeenCalledWith(
    andina.id,
    expect.objectContaining({ cuit: "", version: 1 }),
  );
});

test("refuses a missing name or a malformed CUIT without calling the API", async () => {
  const editSupplier = vi.fn<EditSupplierModalServices["editSupplier"]>();
  const screen = await renderModal({ editSupplier });
  const dialog = screen.getByRole("dialog");
  await userEvent.fill(dialog.getByRole("textbox", { name: "CUIT" }), "123");

  await save(screen, "");

  await expect.element(dialog.getByText("Ingresá el nombre del proveedor.")).toBeVisible();
  await expect
    .element(dialog.getByText("Ingresá un CUIT válido, con el formato NN-NNNNNNNN-N."))
    .toBeVisible();
  expect(editSupplier).not.toHaveBeenCalled();
});

test("shows a name or a CUIT another supplier has under its field", async () => {
  const editSupplier = vi
    .fn<EditSupplierModalServices["editSupplier"]>()
    .mockResolvedValueOnce({ kind: "name_taken" })
    .mockResolvedValueOnce({ kind: "cuit_taken" });
  const screen = await renderModal({ editSupplier });

  const dialog = await save(screen);
  await expect.element(dialog.getByText("Ya existe un proveedor con ese nombre.")).toBeVisible();

  await save(screen);
  await expect.element(dialog.getByText("Ya existe un proveedor con ese CUIT.")).toBeVisible();
});

test("a stale version asks to reload, and reloading refills the form from the fresh supplier and saves over its version", async () => {
  const editSupplier = vi
    .fn<EditSupplierModalServices["editSupplier"]>()
    .mockResolvedValueOnce({ kind: "stale_version" })
    .mockResolvedValueOnce({ kind: "ok" });
  const reload = vi.fn<(id: string) => Promise<SupplierReload>>().mockResolvedValue({
    kind: "found",
    supplier: { ...andina, name: "Andina Mayorista", version: 5 },
  });
  const screen = await renderModal({ editSupplier, reload });
  const dialog = await save(screen, "Otro nombre");

  await expect
    .element(dialog.getByText("Este proveedor cambió mientras lo editabas"))
    .toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Andina Mayorista");
  await expect.element(dialog.getByRole("heading", { name: "Andina Mayorista" })).toBeVisible();
  await save(screen);
  expect(editSupplier).toHaveBeenLastCalledWith(
    andina.id,
    expect.objectContaining({ name: "Andina Mayorista", version: 5 }),
  );
});

test("reloading a supplier that no longer exists says so", async () => {
  const editSupplier = vi
    .fn<EditSupplierModalServices["editSupplier"]>()
    .mockResolvedValue({ kind: "stale_version" });
  const reload = vi
    .fn<(id: string) => Promise<SupplierReload>>()
    .mockResolvedValue({ kind: "not_found" });
  const screen = await renderModal({ editSupplier, reload });
  const dialog = await save(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Este proveedor ya no existe");
});

test("shows a not-found notice when the supplier no longer exists", async () => {
  const editSupplier = vi
    .fn<EditSupplierModalServices["editSupplier"]>()
    .mockResolvedValue({ kind: "not_found" });
  const screen = await renderModal({ editSupplier });

  const dialog = await save(screen);

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Este proveedor ya no existe");
});

test("shows a field the cloud refused under that field", async () => {
  const editSupplier = vi
    .fn<EditSupplierModalServices["editSupplier"]>()
    .mockResolvedValue({ kind: "validation_failed", field: "note" });
  const screen = await renderModal({ editSupplier });

  const dialog = await save(screen);

  await expect.element(dialog.getByText("Revisá la nota.")).toBeVisible();
});

test("shows the failure notice", async () => {
  const editSupplier = vi
    .fn<EditSupplierModalServices["editSupplier"]>()
    .mockResolvedValue({ kind: "failed" });
  const screen = await renderModal({ editSupplier });

  const dialog = await save(screen);

  await expect.element(dialog.getByText("No se guardó el proveedor")).toBeVisible();
  await expect.element(dialog.getByText("Volvé a intentarlo.")).toBeVisible();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const editSupplier = vi.fn<EditSupplierModalServices["editSupplier"]>().mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 60,
  });
  const screen = await renderModal({ editSupplier });

  const dialog = await save(screen);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
});

test("ends the session when saving finds no open session", async () => {
  const editSupplier = vi
    .fn<EditSupplierModalServices["editSupplier"]>()
    .mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ editSupplier, onSessionEnded });

  await save(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when saving comes back forbidden", async () => {
  window.history.pushState(null, "", "/suppliers");
  const editSupplier = vi
    .fn<EditSupplierModalServices["editSupplier"]>()
    .mockResolvedValue({ kind: "forbidden" });
  const screen = await renderModal({ editSupplier });

  await save(screen);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("cancel closes the modal without calling the API", async () => {
  const editSupplier = vi.fn<EditSupplierModalServices["editSupplier"]>();
  const onClose = vi.fn();
  const screen = await renderModal({ editSupplier, onClose });

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(editSupplier).not.toHaveBeenCalled();
});
