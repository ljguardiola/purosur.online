import { FieldSizeProvider } from "@purosur/ui";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  EditSupplierPriceListRowPriceModal,
  type EditSupplierPriceListRowPriceModalServices,
} from "./edit-supplier-price-list-row-price-modal";
import { EXTRACTED_ROWS } from "./test-support/supplier-price-lists";

const [pricedRow, unpricedRow] = EXTRACTED_ROWS as [
  (typeof EXTRACTED_ROWS)[number],
  (typeof EXTRACTED_ROWS)[number],
];
const LIST = { id: "list-1", version: 3 };

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function renderModal({
  setSupplierPriceListRowPrice = vi.fn<
    EditSupplierPriceListRowPriceModalServices["setSupplierPriceListRowPrice"]
  >(),
  target = unpricedRow,
  onSaved = () => {},
  onOutdated = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: {
  setSupplierPriceListRowPrice?: EditSupplierPriceListRowPriceModalServices["setSupplierPriceListRowPrice"];
  target?: typeof unpricedRow;
  onSaved?: () => void;
  onOutdated?: () => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
} = {}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <EditSupplierPriceListRowPriceModal
          list={LIST}
          target={target}
          services={{ setSupplierPriceListRowPrice }}
          onSaved={onSaved}
          onOutdated={onOutdated}
          onClose={onClose}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>,
  );
}

async function save(screen: Awaited<ReturnType<typeof renderModal>>, price: string) {
  const dialog = screen.getByRole("dialog");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Precio/ }), price);
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el precio" }));
  return dialog;
}

test("names the item and starts with its price empty when it has none", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");

  await expect
    .element(dialog.getByRole("heading", { name: "Pasas de uva sultanitas x 10 kg" }))
    .toBeVisible();
  await expect.element(dialog.getByRole("textbox", { name: /^Precio/ })).toHaveValue("");
});

test("starts with the price the list printed", async () => {
  const screen = await renderModal({ target: pricedRow });

  await expect
    .element(screen.getByRole("dialog").getByRole("textbox", { name: /^Precio/ }))
    .toHaveValue("254.500,00");
});

test("saves the typed price in cents against the loaded version and reports it", async () => {
  const setSupplierPriceListRowPrice = vi
    .fn<EditSupplierPriceListRowPriceModalServices["setSupplierPriceListRowPrice"]>()
    .mockResolvedValue({ kind: "ok" });
  const onSaved = vi.fn();
  const screen = await renderModal({ setSupplierPriceListRowPrice, onSaved });

  await save(screen, "58.990,00");

  expect(setSupplierPriceListRowPrice).toHaveBeenCalledWith("list-1", unpricedRow.id, {
    priceCents: 5_899_000,
    version: 3,
  });
  await expect.poll(() => onSaved.mock.calls.length).toBe(1);
});

test("asks for a valid price without calling the cloud", async () => {
  const setSupplierPriceListRowPrice =
    vi.fn<EditSupplierPriceListRowPriceModalServices["setSupplierPriceListRowPrice"]>();
  const screen = await renderModal({ setSupplierPriceListRowPrice });

  const dialog = await save(screen, "abc");

  await expect.element(dialog.getByText("Ingresá un precio válido, como 1.234,50.")).toBeVisible();
  expect(setSupplierPriceListRowPrice).not.toHaveBeenCalled();
});

test("shows a price the cloud refused under its field", async () => {
  const setSupplierPriceListRowPrice = vi
    .fn<EditSupplierPriceListRowPriceModalServices["setSupplierPriceListRowPrice"]>()
    .mockResolvedValue({ kind: "validation_failed", field: "priceCents" });
  const screen = await renderModal({ setSupplierPriceListRowPrice });

  const dialog = await save(screen, "10,00");

  await expect.element(dialog.getByText("Ingresá un precio válido, como 1.234,50.")).toBeVisible();
});

test("tells the list changed, and updating it reports it", async () => {
  const setSupplierPriceListRowPrice = vi
    .fn<EditSupplierPriceListRowPriceModalServices["setSupplierPriceListRowPrice"]>()
    .mockResolvedValue({ kind: "stale_version" });
  const onOutdated = vi.fn();
  const screen = await renderModal({ setSupplierPriceListRowPrice, onOutdated });

  const dialog = await save(screen, "10,00");

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("La lista cambió");
  await userEvent.click(dialog.getByRole("button", { name: "Actualizar la lista" }));
  expect(onOutdated).toHaveBeenCalledTimes(1);
});

test("shows the failure notice, and saving stays available", async () => {
  const setSupplierPriceListRowPrice = vi
    .fn<EditSupplierPriceListRowPriceModalServices["setSupplierPriceListRowPrice"]>()
    .mockResolvedValue({ kind: "failed" });
  const screen = await renderModal({ setSupplierPriceListRowPrice });

  const dialog = await save(screen, "10,00");

  await expect.element(dialog.getByText("No se guardó el precio")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Guardar el precio" })).toBeEnabled();
});

test("ends the session when saving finds no open session", async () => {
  const setSupplierPriceListRowPrice = vi
    .fn<EditSupplierPriceListRowPriceModalServices["setSupplierPriceListRowPrice"]>()
    .mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ setSupplierPriceListRowPrice, onSessionEnded });

  await save(screen, "10,00");

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when saving comes back forbidden", async () => {
  window.history.pushState(null, "", "/lists");
  const setSupplierPriceListRowPrice = vi
    .fn<EditSupplierPriceListRowPriceModalServices["setSupplierPriceListRowPrice"]>()
    .mockResolvedValue({ kind: "forbidden" });
  const screen = await renderModal({ setSupplierPriceListRowPrice });

  await save(screen, "10,00");

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("cancel closes the modal without calling the cloud", async () => {
  const setSupplierPriceListRowPrice =
    vi.fn<EditSupplierPriceListRowPriceModalServices["setSupplierPriceListRowPrice"]>();
  const onClose = vi.fn();
  const screen = await renderModal({ setSupplierPriceListRowPrice, onClose });

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(setSupplierPriceListRowPrice).not.toHaveBeenCalled();
});
