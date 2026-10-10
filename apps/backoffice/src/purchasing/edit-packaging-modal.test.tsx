import type { PackagingSummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { EditPackagingModal, type EditPackagingModalServices } from "./edit-packaging-modal";
import type { PackagingReload } from "./purchasing-queries";
import { bolsaDeAvena, cajaDeMiel } from "./test-support/packagings";

afterEach(() => {
  window.history.pushState(null, "", "/");
});

function renderModal({
  target = bolsaDeAvena,
  editPackaging = vi.fn<EditPackagingModalServices["editPackaging"]>(),
  reload = vi.fn<(id: string) => Promise<PackagingReload>>(),
  onSaved = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: {
  target?: PackagingSummary;
  editPackaging?: EditPackagingModalServices["editPackaging"];
  reload?: (id: string) => Promise<PackagingReload>;
  onSaved?: () => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
} = {}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <EditPackagingModal
          target={target}
          onClose={onClose}
          onSaved={onSaved}
          onSessionEnded={onSessionEnded}
          reload={reload}
          services={{ editPackaging }}
        />
      </main>
    </FieldSizeProvider>,
  );
}

type ModalScreen = Awaited<ReturnType<typeof renderModal>>;

async function save(screen: ModalScreen, fields: { name?: string; quantity?: string } = {}) {
  const dialog = screen.getByRole("dialog");
  if (fields.name !== undefined) {
    await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), fields.name);
  }
  if (fields.quantity !== undefined) {
    await userEvent.fill(
      dialog.getByRole("textbox", { name: /^Cantidad por presentación/ }),
      fields.quantity,
    );
  }
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  return dialog;
}

test("opens titled with the packaging's name, the product fixed and the quantity in the product's unit", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");

  await expect.element(dialog.getByText("Stock · Presentaciones de compra")).toBeVisible();
  await expect.element(dialog.getByRole("heading", { name: "Bolsa de 25 kg" })).toBeVisible();
  await expect
    .element(dialog.getByRole("textbox", { name: "Producto" }))
    .toHaveValue("Avena arrollada");
  await expect
    .element(dialog.getByRole("textbox", { name: "Producto" }))
    .toHaveAttribute("readonly");
  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Bolsa de 25 kg");
  await expect
    .element(dialog.getByRole("textbox", { name: /^Cantidad por presentación/ }))
    .toHaveValue("25,000");
});

test("shows a unit product's quantity in whole units", async () => {
  const screen = await renderModal({ target: cajaDeMiel });

  await expect
    .element(
      screen.getByRole("dialog").getByRole("textbox", { name: /^Cantidad por presentación/ }),
    )
    .toHaveValue("12");
});

test("asks for the quantity again, in its product's current sale unit, when the one it is stated in changed", async () => {
  const editPackaging = vi
    .fn<EditPackagingModalServices["editPackaging"]>()
    .mockResolvedValue({ kind: "ok" });
  const screen = await renderModal({
    target: { ...bolsaDeAvena, productSaleUnit: "UNIT" },
    editPackaging,
  });
  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("textbox", { name: /^Cantidad por presentación/ }))
    .toHaveValue("");

  await save(screen, { quantity: "12,5" });
  await expect
    .element(dialog.getByText("Escribí una cantidad entera de unidades, por ejemplo 16."))
    .toBeVisible();
  expect(editPackaging).not.toHaveBeenCalled();

  await save(screen, { quantity: "12" });
  expect(editPackaging).toHaveBeenCalledWith(bolsaDeAvena.id, {
    name: "Bolsa de 25 kg",
    quantityPerPackage: 12_000,
    version: 2,
  });
});

test("saves the trimmed name and the quantity as thousandths with the version it opened at", async () => {
  const editPackaging = vi
    .fn<EditPackagingModalServices["editPackaging"]>()
    .mockResolvedValue({ kind: "ok" });
  const onSaved = vi.fn();
  const screen = await renderModal({ editPackaging, onSaved });

  await save(screen, { name: " Bolsa de 20 kg ", quantity: "20" });

  expect(editPackaging).toHaveBeenCalledWith(bolsaDeAvena.id, {
    name: "Bolsa de 20 kg",
    quantityPerPackage: 20_000,
    version: 2,
  });
  await expect.poll(() => onSaved.mock.calls.length).toBe(1);
});

test("refuses a missing name or quantity without calling the API", async () => {
  const editPackaging = vi.fn<EditPackagingModalServices["editPackaging"]>();
  const screen = await renderModal({ editPackaging });

  const dialog = await save(screen, { name: "", quantity: "" });

  await expect.element(dialog.getByText("Ingresá el nombre de la presentación.")).toBeVisible();
  await expect.element(dialog.getByText("Ingresá la cantidad por presentación.")).toBeVisible();
  expect(editPackaging).not.toHaveBeenCalled();
});

test("shows a name the product already has under the name field", async () => {
  const editPackaging = vi
    .fn<EditPackagingModalServices["editPackaging"]>()
    .mockResolvedValue({ kind: "name_taken" });
  const screen = await renderModal({ editPackaging });

  const dialog = await save(screen);

  await expect
    .element(dialog.getByText("Este producto ya tiene una presentación con ese nombre."))
    .toBeVisible();
});

test("shows a quantity the cloud refused under the quantity field", async () => {
  const editPackaging = vi
    .fn<EditPackagingModalServices["editPackaging"]>()
    .mockResolvedValue({ kind: "validation_failed", field: "quantityPerPackage" });
  const screen = await renderModal({ editPackaging });

  const dialog = await save(screen);

  await expect
    .element(
      dialog.getByText(
        "Escribí los kilos con coma para los decimales, hasta 3, por ejemplo 12,150.",
      ),
    )
    .toBeVisible();
});

test("a stale version asks to reload, and reloading refills the form from the fresh packaging and saves over its version", async () => {
  const editPackaging = vi
    .fn<EditPackagingModalServices["editPackaging"]>()
    .mockResolvedValueOnce({ kind: "stale_version" })
    .mockResolvedValueOnce({ kind: "ok" });
  const reload = vi.fn<(id: string) => Promise<PackagingReload>>().mockResolvedValue({
    kind: "found",
    packaging: { ...bolsaDeAvena, name: "Bolsa grande", quantityPerPackage: 30_000, version: 5 },
  });
  const screen = await renderModal({ editPackaging, reload });
  const dialog = await save(screen, { name: "Otro" });

  await expect
    .element(dialog.getByText("Esta presentación cambió mientras la editabas"))
    .toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Bolsa grande");
  await expect
    .element(dialog.getByRole("textbox", { name: /^Cantidad por presentación/ }))
    .toHaveValue("30,000");
  await save(screen);
  expect(editPackaging).toHaveBeenLastCalledWith(bolsaDeAvena.id, {
    name: "Bolsa grande",
    quantityPerPackage: 30_000,
    version: 5,
  });
});

test("reloading a packaging that no longer exists says so", async () => {
  const editPackaging = vi
    .fn<EditPackagingModalServices["editPackaging"]>()
    .mockResolvedValue({ kind: "stale_version" });
  const reload = vi
    .fn<(id: string) => Promise<PackagingReload>>()
    .mockResolvedValue({ kind: "not_found" });
  const screen = await renderModal({ editPackaging, reload });
  const dialog = await save(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect
    .element(dialog.getByRole("alert"))
    .toHaveTextContent("Esta presentación ya no existe");
});

test("shows a not-found notice when the packaging no longer exists", async () => {
  const editPackaging = vi
    .fn<EditPackagingModalServices["editPackaging"]>()
    .mockResolvedValue({ kind: "not_found" });
  const screen = await renderModal({ editPackaging });

  const dialog = await save(screen);

  await expect
    .element(dialog.getByRole("alert"))
    .toHaveTextContent("Esta presentación ya no existe");
});

test("shows the failure notice", async () => {
  const editPackaging = vi
    .fn<EditPackagingModalServices["editPackaging"]>()
    .mockResolvedValue({ kind: "failed" });
  const screen = await renderModal({ editPackaging });

  const dialog = await save(screen);

  await expect.element(dialog.getByText("No se guardó la presentación")).toBeVisible();
  await expect.element(dialog.getByText("Volvé a intentarlo.")).toBeVisible();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const editPackaging = vi.fn<EditPackagingModalServices["editPackaging"]>().mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 60,
  });
  const screen = await renderModal({ editPackaging });

  const dialog = await save(screen);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
});

test("ends the session when saving finds no open session", async () => {
  const editPackaging = vi
    .fn<EditPackagingModalServices["editPackaging"]>()
    .mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ editPackaging, onSessionEnded });

  await save(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when saving comes back forbidden", async () => {
  window.history.pushState(null, "", "/purchase-packagings");
  const editPackaging = vi
    .fn<EditPackagingModalServices["editPackaging"]>()
    .mockResolvedValue({ kind: "forbidden" });
  const screen = await renderModal({ editPackaging });

  await save(screen);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("cancel closes the modal without calling the API", async () => {
  const editPackaging = vi.fn<EditPackagingModalServices["editPackaging"]>();
  const onClose = vi.fn();
  const screen = await renderModal({ editPackaging, onClose });

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(editPackaging).not.toHaveBeenCalled();
});
