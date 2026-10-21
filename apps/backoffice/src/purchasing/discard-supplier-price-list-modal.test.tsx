import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  DiscardSupplierPriceListModal,
  type DiscardSupplierPriceListModalServices,
} from "./discard-supplier-price-list-modal";
import { READ_LIST, reviewOf } from "./test-support/supplier-price-lists";

const { list } = reviewOf(READ_LIST, []);

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function renderModal({
  discardSupplierPriceList = vi.fn<
    DiscardSupplierPriceListModalServices["discardSupplierPriceList"]
  >(),
  onDiscarded = () => {},
  onOutdated = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: {
  discardSupplierPriceList?: DiscardSupplierPriceListModalServices["discardSupplierPriceList"];
  onDiscarded?: () => void;
  onOutdated?: () => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
} = {}) {
  return render(
    <main>
      <DiscardSupplierPriceListModal
        target={list}
        services={{ discardSupplierPriceList }}
        onDiscarded={onDiscarded}
        onOutdated={onOutdated}
        onClose={onClose}
        onSessionEnded={onSessionEnded}
      />
    </main>,
  );
}

async function confirm(screen: Awaited<ReturnType<typeof renderModal>>) {
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Descartar la lista" }));
  return dialog;
}

test("asks about the list by its supplier, saying nothing of it is kept", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");

  await expect
    .element(dialog.getByRole("heading", { name: "¿Descartar la lista de Distribuidora Andina?" }))
    .toBeVisible();
  await expect
    .element(dialog.getByText("No se guarda ningún ítem ni ningún precio de esta lista."))
    .toBeVisible();
});

test("confirming discards the list against the loaded version and reports it", async () => {
  const discardSupplierPriceList = vi
    .fn<DiscardSupplierPriceListModalServices["discardSupplierPriceList"]>()
    .mockResolvedValue({ kind: "ok" });
  const onDiscarded = vi.fn();
  const screen = await renderModal({ discardSupplierPriceList, onDiscarded });

  await confirm(screen);

  expect(discardSupplierPriceList).toHaveBeenCalledWith(list.id, { version: 3 });
  await expect.poll(() => onDiscarded.mock.calls.length).toBe(1);
});

test("cancel closes the question without calling the cloud", async () => {
  const discardSupplierPriceList =
    vi.fn<DiscardSupplierPriceListModalServices["discardSupplierPriceList"]>();
  const onClose = vi.fn();
  const screen = await renderModal({ discardSupplierPriceList, onClose });

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(discardSupplierPriceList).not.toHaveBeenCalled();
});

test("tells when the list is no longer editable, and updating it reports it", async () => {
  const discardSupplierPriceList = vi
    .fn<DiscardSupplierPriceListModalServices["discardSupplierPriceList"]>()
    .mockResolvedValue({ kind: "not_editable" });
  const onOutdated = vi.fn();
  const screen = await renderModal({ discardSupplierPriceList, onOutdated });
  const dialog = await confirm(screen);

  await expect
    .element(dialog.getByRole("alert"))
    .toHaveTextContent("La lista ya no se puede modificar");
  await userEvent.click(dialog.getByRole("button", { name: "Actualizar la lista" }));

  expect(onOutdated).toHaveBeenCalledTimes(1);
});

test("shows the failure notice, and the confirmation stays available", async () => {
  const discardSupplierPriceList = vi
    .fn<DiscardSupplierPriceListModalServices["discardSupplierPriceList"]>()
    .mockResolvedValue({ kind: "failed" });
  const screen = await renderModal({ discardSupplierPriceList });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByText("No se descartó la lista")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Descartar la lista" })).toBeEnabled();
});

test("ends the session when discarding finds no open session", async () => {
  const discardSupplierPriceList = vi
    .fn<DiscardSupplierPriceListModalServices["discardSupplierPriceList"]>()
    .mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ discardSupplierPriceList, onSessionEnded });

  await confirm(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when discarding comes back forbidden", async () => {
  window.history.pushState(null, "", "/lists");
  const discardSupplierPriceList = vi
    .fn<DiscardSupplierPriceListModalServices["discardSupplierPriceList"]>()
    .mockResolvedValue({ kind: "forbidden" });
  const screen = await renderModal({ discardSupplierPriceList });

  await confirm(screen);

  await expect.poll(() => window.location.pathname).toBe("/account");
});
