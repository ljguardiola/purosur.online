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
    loadSupplierPriceListWebPage:
      vi.fn<UploadSupplierPriceListModalServices["loadSupplierPriceListWebPage"]>(),
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
  await userEvent.click(dialog.getByRole("button", { name: /Proveedor/ }));
  await userEvent.click(screen.getByRole("option", { name }));
}

function fileInput(screen: ModalScreen) {
  return screen.getByRole("dialog").getByLabelText("Archivo", { exact: true });
}

async function chooseFile(screen: ModalScreen, file: File = pdf) {
  await userEvent.upload(fileInput(screen), file);
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
  await expect.element(dialog.getByText("Elegir un archivo")).toBeVisible();
});

test("only accepts a PDF file", async () => {
  const screen = await renderModal();

  await expect.element(fileInput(screen)).toHaveAttribute("accept", "application/pdf,.pdf");
});

test("offers the active suppliers by name", async () => {
  const screen = await renderModal();

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: /Proveedor/ }));

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
    .element(screen.getByRole("dialog").getByRole("button", { name: /Proveedor/ }))
    .toHaveTextContent("Granos del Valle");
});

test("shows the chosen file with its size, and lets the person choose another", async () => {
  const screen = await renderModal();

  await chooseFile(screen);
  const dialog = screen.getByRole("dialog");

  await expect.element(dialog.getByText("lista-septiembre-2026.pdf")).toBeVisible();
  await expect.element(dialog.getByText("3 MB")).toBeVisible();
  await expect.element(dialog.getByText("Elegir otro archivo")).toBeVisible();
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

  expect(services.uploadSupplierPriceList).toHaveBeenCalledWith(
    { supplierId: andina.id, fileName: "lista-septiembre-2026.pdf" },
    pdf,
  );
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

test("refuses a file whose name is too long without calling the cloud, saying so on the file", async () => {
  const services = createServices();
  const screen = await renderModal({ services });
  const dialog = screen.getByRole("dialog");

  await chooseSupplier(screen, "Distribuidora Andina");
  await chooseFile(
    screen,
    new File(["%PDF-1.7"], `${"a".repeat(256)}.pdf`, { type: "application/pdf" }),
  );
  await userEvent.click(dialog.getByRole("button", { name: "Leer la lista" }));

  await expect
    .element(fileInput(screen))
    .toHaveAccessibleDescription(
      expect.stringContaining("El nombre del archivo es demasiado largo."),
    );
  expect(services.uploadSupplierPriceList).not.toHaveBeenCalled();
});

test("shows the cloud's refusal of the file name as a problem of the chosen file's name", async () => {
  const services = createServices();
  vi.mocked(services.uploadSupplierPriceList).mockResolvedValue({
    kind: "validation_failed",
    field: "fileName",
  });
  const screen = await renderModal({ services });

  const dialog = await submit(screen);

  await expect.element(dialog.getByText("El nombre del archivo es demasiado largo.")).toBeVisible();
  expect(dialog.getByText("Elegí el archivo PDF de la lista.").query()).toBeNull();
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

const PAGE_ADDRESS = "https://distribuidora-sur.example/precios";

function addressInput(screen: ModalScreen) {
  return screen.getByRole("dialog").getByLabelText("Dirección de la página");
}

async function chooseWebPage(screen: ModalScreen) {
  const label = screen
    .getByRole("dialog")
    .getByRole("radio", { name: "Página web" })
    .element()
    .closest("label");
  if (!label) {
    throw new Error("no label for the web page card");
  }
  await userEvent.click(label);
}

async function submitWebPage(screen: ModalScreen, address: string = PAGE_ADDRESS) {
  const dialog = screen.getByRole("dialog");
  await chooseSupplier(screen, "Distribuidora Andina");
  await chooseWebPage(screen);
  await userEvent.fill(addressInput(screen), address);
  await userEvent.click(dialog.getByRole("button", { name: "Leer la lista" }));
  return dialog;
}

test("offers a PDF file or a web page as where the list comes from, starting with the PDF", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");

  await expect
    .element(dialog.getByRole("radiogroup", { name: /De dónde sale la lista/ }))
    .toBeVisible();
  await expect.element(dialog.getByRole("radio", { name: "Archivo PDF" })).toBeChecked();
  await expect.element(dialog.getByText("Se sube desde la computadora")).toBeVisible();
  await expect.element(dialog.getByRole("radio", { name: "Página web" })).not.toBeChecked();
  await expect.element(dialog.getByText("Se lee desde su dirección en internet")).toBeVisible();
  expect(dialog.getByLabelText("Dirección de la página").query()).toBeNull();
});

test("asks for the address of the page instead of a file when the list comes from a web page", async () => {
  const screen = await renderModal();

  await chooseWebPage(screen);
  const dialog = screen.getByRole("dialog");

  await expect.element(addressInput(screen)).toBeVisible();
  expect(dialog.getByText("Elegir un archivo").query()).toBeNull();
  await expect
    .element(
      dialog.getByText(
        "Se leen los ítems, las presentaciones y los precios. Nada se guarda hasta revisar cada ítem.",
      ),
    )
    .toBeVisible();
});

test("loads the page for the chosen supplier and reports it without uploading a file", async () => {
  const services = createServices();
  vi.mocked(services.loadSupplierPriceListWebPage).mockResolvedValue({ kind: "ok" });
  const onUploaded = vi.fn();
  const screen = await renderModal({ services, onUploaded });

  await submitWebPage(screen);

  expect(services.loadSupplierPriceListWebPage).toHaveBeenCalledWith({
    supplierId: andina.id,
    url: PAGE_ADDRESS,
  });
  expect(services.uploadSupplierPriceList).not.toHaveBeenCalled();
  await expect.poll(() => onUploaded.mock.calls.length).toBe(1);
});

test("asks for the supplier and the address without calling the cloud", async () => {
  const services = createServices();
  const screen = await renderModal({ services });
  const dialog = screen.getByRole("dialog");

  await chooseWebPage(screen);
  await userEvent.click(dialog.getByRole("button", { name: "Leer la lista" }));

  await expect.element(dialog.getByText("Elegí el proveedor.")).toBeVisible();
  await expect.element(dialog.getByText("Escribí la dirección de la página.")).toBeVisible();
  expect(services.loadSupplierPriceListWebPage).not.toHaveBeenCalled();
});

test("refuses an address that is not a web address without calling the cloud", async () => {
  const services = createServices();
  const screen = await renderModal({ services });

  const dialog = await submitWebPage(screen, "precios del proveedor");

  await expect
    .element(
      dialog.getByText(
        "Escribí la dirección completa de la página, empezando con http:// o https://.",
      ),
    )
    .toBeVisible();
  expect(services.loadSupplierPriceListWebPage).not.toHaveBeenCalled();
});

test("marks the address as refused with the reason, followed by what else is not read", async () => {
  const services = createServices();
  vi.mocked(services.loadSupplierPriceListWebPage).mockResolvedValue({
    kind: "page_refused",
    reason: "address_not_public",
  });
  const screen = await renderModal({ services });

  const dialog = await submitWebPage(screen);

  await expect
    .element(
      dialog.getByText(
        "La dirección no es de una página pública. Tiene que ser la página del proveedor en internet.",
      ),
    )
    .toBeVisible();
  await expect.element(addressInput(screen)).toBeInvalid();
  await expect
    .element(
      dialog.getByText(
        "Tampoco se lee una página que redirige demasiadas veces, tarda demasiado, es muy pesada o no es PDF ni una página web.",
      ),
    )
    .toBeVisible();
  expect(dialog.getByText(/^Se leen los ítems/).query()).toBeNull();
  await expect.element(dialog.getByRole("button", { name: "Leer la lista" })).toBeEnabled();
});

test("marks the address as refused with the reason alone when the reason is one of what else is not read", async () => {
  const services = createServices();
  vi.mocked(services.loadSupplierPriceListWebPage).mockResolvedValue({
    kind: "page_refused",
    reason: "too_large",
  });
  const screen = await renderModal({ services });

  const dialog = await submitWebPage(screen);

  await expect.element(dialog.getByText("La página es demasiado pesada.")).toBeVisible();
  expect(dialog.getByText(/^Tampoco se lee/).query()).toBeNull();
  expect(dialog.getByText(/^Se leen los ítems/).query()).toBeNull();
});

test("goes back to the first hint once the address is edited after a refusal", async () => {
  const services = createServices();
  vi.mocked(services.loadSupplierPriceListWebPage).mockResolvedValue({
    kind: "page_refused",
    reason: "unreachable",
  });
  const screen = await renderModal({ services });
  const dialog = await submitWebPage(screen);
  await expect.element(dialog.getByText(/^Tampoco se lee/)).toBeVisible();

  await userEvent.fill(addressInput(screen), `${PAGE_ADDRESS}/lista`);

  await expect.element(dialog.getByText(/^Se leen los ítems/)).toBeVisible();
  expect(dialog.getByText(/^Tampoco se lee/).query()).toBeNull();
  expect(dialog.getByText("La página no respondió. Revisá la dirección.").query()).toBeNull();
});

test("says the day's reading limit was reached when loading a page", async () => {
  const services = createServices();
  vi.mocked(services.loadSupplierPriceListWebPage).mockResolvedValue({
    kind: "daily_cap_reached",
    cap: 10,
  });
  const screen = await renderModal({ services });

  const dialog = await submitWebPage(screen);

  await expect.element(dialog.getByText("Por hoy no se pueden leer más listas")).toBeVisible();
});

test.each([
  [{ kind: "supplier_inactive" }, "Este proveedor está desactivado"],
  [{ kind: "supplier_not_found" }, "Este proveedor ya no existe"],
  [{ kind: "reading_unavailable" }, "La lectura de listas no está disponible"],
  [{ kind: "failed" }, "No se cargó la lista"],
  [{ kind: "rate_limited", retryAfterSeconds: 60 }, "Demasiadas solicitudes"],
] as const)("shows %j when loading a page", async (outcome, title) => {
  const services = createServices();
  vi.mocked(services.loadSupplierPriceListWebPage).mockResolvedValue(outcome);
  const screen = await renderModal({ services });

  const dialog = await submitWebPage(screen);

  await expect.element(dialog.getByText(title)).toBeVisible();
});

test("shows the cloud's refusal of the address under the address", async () => {
  const services = createServices();
  vi.mocked(services.loadSupplierPriceListWebPage).mockResolvedValue({
    kind: "validation_failed",
    field: "url",
  });
  const screen = await renderModal({ services });

  const dialog = await submitWebPage(screen);

  await expect.element(dialog.getByText("Revisá la dirección.")).toBeVisible();
  await expect.element(addressInput(screen)).toBeInvalid();
});

test("ends the session when loading a page finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.loadSupplierPriceListWebPage).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ services, onSessionEnded });

  await submitWebPage(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
