import { ANOTHER_FICTIONAL_CUIT, FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import { FieldSizeProvider } from "@purosur/ui";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { suppliersWithCuits } from "./test-support/suppliers";
import {
  UploadSupplierPriceListModal,
  type UploadSupplierPriceListModalServices,
} from "./upload-supplier-price-list-modal";

const { andina, cerealera, granos } = suppliersWithCuits(FICTIONAL_CUIT, ANOTHER_FICTIONAL_CUIT);
const pdf = new File([new Uint8Array(2_516_582)], "lista-septiembre-2026.pdf", {
  type: "application/pdf",
});

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function createServices(
  overrides: Partial<UploadSupplierPriceListModalServices> = {},
): UploadSupplierPriceListModalServices {
  return {
    fetchSuppliers: vi
      .fn<UploadSupplierPriceListModalServices["fetchSuppliers"]>()
      .mockResolvedValue({ kind: "ok", value: [granos, cerealera, andina] }),
    uploadSupplierPriceList:
      vi.fn<UploadSupplierPriceListModalServices["uploadSupplierPriceList"]>(),
    ...overrides,
  };
}

function renderModal({
  services = createServices(),
  open = true,
  initialSupplierId = null,
  onUploaded = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: {
  services?: UploadSupplierPriceListModalServices;
  open?: boolean;
  initialSupplierId?: string | null;
  onUploaded?: () => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
} = {}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <UploadSupplierPriceListModal
          open={open}
          initialSupplierId={initialSupplierId}
          services={services}
          onUploaded={onUploaded}
          onClose={onClose}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>,
  );
}

type ModalScreen = Awaited<ReturnType<typeof renderModal>>;

async function chooseSupplier(screen: ModalScreen, name: string) {
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: /^Proveedor/ }));
  await userEvent.click(screen.getByRole("option", { name }));
}

async function chooseFile(screen: ModalScreen, file: File = pdf) {
  await userEvent.upload(screen.getByRole("dialog").getByLabelText("Archivo PDF"), file);
}

async function submit(screen: ModalScreen) {
  const dialog = screen.getByRole("dialog");
  await chooseSupplier(screen, "Distribuidora Andina");
  await chooseFile(screen);
  await userEvent.click(dialog.getByRole("button", { name: "Leer la lista" }));
  return dialog;
}

test("shows the title, what reading does and the file to choose", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");

  await expect.element(dialog.getByText("Pedidos · Listas de proveedores")).toBeVisible();
  await expect.element(dialog.getByRole("heading", { name: "Cargar una lista" })).toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "Se leen los ítems, las presentaciones y los precios. Nada se guarda hasta revisar cada ítem.",
      ),
    )
    .toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Elegir un archivo" })).toBeVisible();
});

test("offers the active suppliers by name", async () => {
  const screen = await renderModal();

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: /^Proveedor/ }));

  await expect
    .poll(() =>
      screen
        .getByRole("option")
        .all()
        .map((option) => option.element().textContent),
    )
    .toEqual(["Distribuidora Andina", "Granos del Valle"]);
});

test("opens with the supplier it is given chosen", async () => {
  const screen = await renderModal({ initialSupplierId: granos.id });

  await expect
    .element(screen.getByRole("dialog").getByRole("button", { name: /^Proveedor/ }))
    .toHaveTextContent("Granos del Valle");
});

test("shows the chosen file with its size, and lets the person choose another", async () => {
  const screen = await renderModal();

  await chooseFile(screen);
  const dialog = screen.getByRole("dialog");

  await expect.element(dialog.getByText("lista-septiembre-2026.pdf")).toBeVisible();
  await expect.element(dialog.getByText("2,4 MB")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Elegir otro archivo" })).toBeVisible();
});

test("asks for the supplier and the file without calling the cloud", async () => {
  const services = createServices();
  const screen = await renderModal({ services });
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Leer la lista" }));

  await expect.element(dialog.getByText("Elegí el proveedor.")).toBeVisible();
  await expect.element(dialog.getByText("Elegí el archivo PDF de la lista.")).toBeVisible();
  expect(services.uploadSupplierPriceList).not.toHaveBeenCalled();
});

test("uploads the file for the chosen supplier and reports it", async () => {
  const services = createServices();
  vi.mocked(services.uploadSupplierPriceList).mockResolvedValue({ kind: "ok" });
  const onUploaded = vi.fn();
  const screen = await renderModal({ services, onUploaded });

  await submit(screen);

  expect(services.uploadSupplierPriceList).toHaveBeenCalledWith({
    supplierId: andina.id,
    file: pdf,
  });
  await expect.poll(() => onUploaded.mock.calls.length).toBe(1);
});

test("says the day's reading limit was reached", async () => {
  const services = createServices();
  vi.mocked(services.uploadSupplierPriceList).mockResolvedValue({
    kind: "daily_cap_reached",
    cap: 10,
  });
  const screen = await renderModal({ services });

  const dialog = await submit(screen);

  await expect.element(dialog.getByText("Por hoy no se pueden leer más listas")).toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "Se llegó al tope de lecturas del día de esta sucursal. La lista se puede cargar mañana.",
      ),
    )
    .toBeVisible();
});

test.each([
  [{ kind: "file_too_large" }, "El archivo es demasiado grande", "Elegí un PDF más liviano."],
  [{ kind: "not_a_pdf" }, "El archivo no es un PDF válido", "Elegí otro archivo."],
  [{ kind: "supplier_inactive" }, "Este proveedor está desactivado", "Elegí otro proveedor."],
  [{ kind: "supplier_not_found" }, "Este proveedor ya no existe", "Elegí otro proveedor."],
  [
    { kind: "reading_unavailable" },
    "La lectura de listas no está disponible",
    "Volvé a intentarlo más tarde.",
  ],
  [{ kind: "failed" }, "No se cargó la lista", "Volvé a intentarlo."],
  [
    { kind: "rate_limited", retryAfterSeconds: 60 },
    "Demasiadas solicitudes",
    "Se puede volver a intentar en 1 minuto.",
  ],
] as const)("shows %j", async (outcome, title, description) => {
  const services = createServices();
  vi.mocked(services.uploadSupplierPriceList).mockResolvedValue(outcome);
  const screen = await renderModal({ services });

  const dialog = await submit(screen);

  await expect.element(dialog.getByText(title)).toBeVisible();
  await expect.element(dialog.getByText(description)).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Leer la lista" })).toBeEnabled();
});

test("shows a field the cloud refused under that field", async () => {
  const services = createServices();
  vi.mocked(services.uploadSupplierPriceList).mockResolvedValue({
    kind: "validation_failed",
    field: "supplierId",
  });
  const screen = await renderModal({ services });

  const dialog = await submit(screen);

  await expect.element(dialog.getByText("Elegí el proveedor.")).toBeVisible();
});

test("ends the session when uploading finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.uploadSupplierPriceList).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ services, onSessionEnded });

  await submit(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when uploading comes back forbidden", async () => {
  window.history.pushState(null, "", "/lists");
  const services = createServices();
  vi.mocked(services.uploadSupplierPriceList).mockResolvedValue({ kind: "forbidden" });
  const screen = await renderModal({ services });

  await submit(screen);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("reads the suppliers only while it is open", async () => {
  const services = createServices();
  await renderModal({ services, open: false });

  expect(services.fetchSuppliers).not.toHaveBeenCalled();
});

test("cancel closes the modal without calling the cloud", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const screen = await renderModal({ services, onClose });

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(services.uploadSupplierPriceList).not.toHaveBeenCalled();
});
