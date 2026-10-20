import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  RemoveSupplierPriceListRowModal,
  type RemoveSupplierPriceListRowModalServices,
} from "./remove-supplier-price-list-row-modal";
import { EXTRACTED_ROWS } from "./test-support/supplier-price-lists";

const row = EXTRACTED_ROWS[0] as (typeof EXTRACTED_ROWS)[number];

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function renderModal({
  removeSupplierPriceListRow = vi.fn<
    RemoveSupplierPriceListRowModalServices["removeSupplierPriceListRow"]
  >(),
  onRemoved = () => {},
  onOutdated = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: {
  removeSupplierPriceListRow?: RemoveSupplierPriceListRowModalServices["removeSupplierPriceListRow"];
  onRemoved?: () => void;
  onOutdated?: () => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
} = {}) {
  return render(
    <main>
      <RemoveSupplierPriceListRowModal
        list={{ id: "list-1", version: 3 }}
        target={row}
        services={{ removeSupplierPriceListRow }}
        onRemoved={onRemoved}
        onOutdated={onOutdated}
        onClose={onClose}
        onSessionEnded={onSessionEnded}
      />
    </main>,
  );
}

async function confirm(screen: Awaited<ReturnType<typeof renderModal>>) {
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Quitar el ítem" }));
  return dialog;
}

test("asks about the item by its description", async () => {
  const screen = await renderModal();

  await expect
    .element(
      screen
        .getByRole("dialog")
        .getByRole("heading", { name: '¿Quitar "Almendra pelada Nonpareil x 25 kg" de la lista?' }),
    )
    .toBeVisible();
});

test("confirming removes the row against the loaded version and reports it", async () => {
  const removeSupplierPriceListRow = vi
    .fn<RemoveSupplierPriceListRowModalServices["removeSupplierPriceListRow"]>()
    .mockResolvedValue({ kind: "ok" });
  const onRemoved = vi.fn();
  const screen = await renderModal({ removeSupplierPriceListRow, onRemoved });

  await confirm(screen);

  expect(removeSupplierPriceListRow).toHaveBeenCalledWith("list-1", row.id, { version: 3 });
  await expect.poll(() => onRemoved.mock.calls.length).toBe(1);
});

test("cancel closes the question without calling the cloud", async () => {
  const removeSupplierPriceListRow =
    vi.fn<RemoveSupplierPriceListRowModalServices["removeSupplierPriceListRow"]>();
  const onClose = vi.fn();
  const screen = await renderModal({ removeSupplierPriceListRow, onClose });

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(removeSupplierPriceListRow).not.toHaveBeenCalled();
});

test("tells when the list changed, and updating it reports it", async () => {
  const removeSupplierPriceListRow = vi
    .fn<RemoveSupplierPriceListRowModalServices["removeSupplierPriceListRow"]>()
    .mockResolvedValue({ kind: "stale_version" });
  const onOutdated = vi.fn();
  const screen = await renderModal({ removeSupplierPriceListRow, onOutdated });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("La lista cambió");
  await userEvent.click(dialog.getByRole("button", { name: "Actualizar la lista" }));

  expect(onOutdated).toHaveBeenCalledTimes(1);
});

test("shows the failure notice, and the confirmation stays available", async () => {
  const removeSupplierPriceListRow = vi
    .fn<RemoveSupplierPriceListRowModalServices["removeSupplierPriceListRow"]>()
    .mockResolvedValue({ kind: "failed" });
  const screen = await renderModal({ removeSupplierPriceListRow });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByText("No se quitó el ítem")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Quitar el ítem" })).toBeEnabled();
});

test("ends the session when removing finds no open session", async () => {
  const removeSupplierPriceListRow = vi
    .fn<RemoveSupplierPriceListRowModalServices["removeSupplierPriceListRow"]>()
    .mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ removeSupplierPriceListRow, onSessionEnded });

  await confirm(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when removing comes back forbidden", async () => {
  window.history.pushState(null, "", "/lists");
  const removeSupplierPriceListRow = vi
    .fn<RemoveSupplierPriceListRowModalServices["removeSupplierPriceListRow"]>()
    .mockResolvedValue({ kind: "forbidden" });
  const screen = await renderModal({ removeSupplierPriceListRow });

  await confirm(screen);

  await expect.poll(() => window.location.pathname).toBe("/account");
});
