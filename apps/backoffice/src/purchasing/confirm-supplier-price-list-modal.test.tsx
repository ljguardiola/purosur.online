import { FieldSizeProvider } from "@purosur/ui";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  ConfirmSupplierPriceListModal,
  type ConfirmSupplierPriceListModalServices,
} from "./confirm-supplier-price-list-modal";
import { READ_LIST, reviewOf } from "./test-support/supplier-price-lists";

const dated = reviewOf(READ_LIST, []).list;
const undated = reviewOf({ ...READ_LIST, listDate: null }, []).list;
const unknownVat = reviewOf(READ_LIST, [], undefined, null).list;

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function renderModal({
  confirmSupplierPriceList = vi.fn<
    ConfirmSupplierPriceListModalServices["confirmSupplierPriceList"]
  >(),
  target = dated,
  onConfirmed = () => {},
  onOutdated = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: {
  confirmSupplierPriceList?: ConfirmSupplierPriceListModalServices["confirmSupplierPriceList"];
  target?: typeof dated;
  onConfirmed?: () => void;
  onOutdated?: () => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
} = {}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <ConfirmSupplierPriceListModal
          target={target}
          services={{ confirmSupplierPriceList }}
          onConfirmed={onConfirmed}
          onOutdated={onOutdated}
          onClose={onClose}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>,
  );
}

type ModalScreen = Awaited<ReturnType<typeof renderModal>>;

function dateSegments(screen: ModalScreen) {
  return screen
    .getByRole("dialog")
    .getByRole("group", { name: /^Fecha de la lista/ })
    .getByRole("spinbutton");
}

async function confirm(screen: ModalScreen) {
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Confirmar la lista" }));
  return dialog;
}

test("names the list's supplier and starts with the date the list was read with", async () => {
  const screen = await renderModal();

  await expect
    .element(
      screen
        .getByRole("dialog")
        .getByRole("heading", { name: "¿Confirmar la lista de Distribuidora Andina?" }),
    )
    .toBeVisible();
  await expect
    .poll(() =>
      dateSegments(screen)
        .all()
        .map((segment) => segment.element().textContent),
    )
    .toEqual(["25", "9", "2026"]);
});

test("confirming sends the date and the loaded version, and reports it", async () => {
  const confirmSupplierPriceList = vi
    .fn<ConfirmSupplierPriceListModalServices["confirmSupplierPriceList"]>()
    .mockResolvedValue({ kind: "ok" });
  const onConfirmed = vi.fn();
  const screen = await renderModal({ confirmSupplierPriceList, onConfirmed });

  await confirm(screen);

  expect(confirmSupplierPriceList).toHaveBeenCalledWith(dated.id, {
    listDate: "2026-09-25",
    pricesIncludeVat: true,
    version: 3,
  });
  await expect.poll(() => onConfirmed.mock.calls.length).toBe(1);
});

test("starts with the VAT answer the list was read with and sends the one chosen instead", async () => {
  const confirmSupplierPriceList = vi
    .fn<ConfirmSupplierPriceListModalServices["confirmSupplierPriceList"]>()
    .mockResolvedValue({ kind: "ok" });
  const screen = await renderModal({ confirmSupplierPriceList });
  const dialog = screen.getByRole("dialog");
  const vat = dialog.getByRole("button", { name: /Los precios/ });

  await expect.element(vat).toHaveTextContent("incluyen IVA");
  await userEvent.click(vat);
  await userEvent.click(screen.getByRole("option", { name: "no incluyen IVA" }));
  await confirm(screen);

  expect(confirmSupplierPriceList).toHaveBeenCalledWith(dated.id, {
    listDate: "2026-09-25",
    pricesIncludeVat: false,
    version: 3,
  });
});

test("asks for the VAT answer when the list does not say and none was chosen", async () => {
  const confirmSupplierPriceList = vi
    .fn<ConfirmSupplierPriceListModalServices["confirmSupplierPriceList"]>()
    .mockResolvedValue({ kind: "vat_missing" });
  const screen = await renderModal({ target: unknownVat, confirmSupplierPriceList });

  const dialog = await confirm(screen);

  expect(confirmSupplierPriceList).toHaveBeenCalledWith(unknownVat.id, {
    listDate: "2026-09-25",
    pricesIncludeVat: null,
    version: 3,
  });
  await expect.element(dialog.getByText("Elegí si los precios incluyen IVA.")).toBeVisible();
});

test("sends the date the person typed over the one the list was read with", async () => {
  const confirmSupplierPriceList = vi
    .fn<ConfirmSupplierPriceListModalServices["confirmSupplierPriceList"]>()
    .mockResolvedValue({ kind: "ok" });
  const screen = await renderModal({ target: undated, confirmSupplierPriceList });

  await userEvent.click(dateSegments(screen).first());
  await userEvent.keyboard("05092026");
  await confirm(screen);

  expect(confirmSupplierPriceList).toHaveBeenCalledWith(undated.id, {
    listDate: "2026-09-05",
    pricesIncludeVat: true,
    version: 3,
  });
});

test("asks for the date when the cloud says the list has none", async () => {
  const confirmSupplierPriceList = vi
    .fn<ConfirmSupplierPriceListModalServices["confirmSupplierPriceList"]>()
    .mockResolvedValue({ kind: "list_date_missing" });
  const screen = await renderModal({ target: undated, confirmSupplierPriceList });

  const dialog = await confirm(screen);

  await expect.element(dialog.getByText("Ingresá la fecha de la lista.")).toBeVisible();
});

test.each([
  [{ kind: "unpriced_rows" }, "Hay ítems sin precio"],
  [{ kind: "no_rows" }, "La lista no tiene ítems"],
  [{ kind: "failed" }, "No se confirmó la lista"],
] as const)("tells %j", async (outcome, title) => {
  const confirmSupplierPriceList = vi
    .fn<ConfirmSupplierPriceListModalServices["confirmSupplierPriceList"]>()
    .mockResolvedValue(outcome);
  const screen = await renderModal({ confirmSupplierPriceList });

  const dialog = await confirm(screen);

  await expect.element(dialog.getByText(title)).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Confirmar la lista" })).toBeEnabled();
});

test("tells when the list changed, and updating it reports it", async () => {
  const confirmSupplierPriceList = vi
    .fn<ConfirmSupplierPriceListModalServices["confirmSupplierPriceList"]>()
    .mockResolvedValue({ kind: "stale_version" });
  const onOutdated = vi.fn();
  const screen = await renderModal({ confirmSupplierPriceList, onOutdated });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByText("La lista cambió")).toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Actualizar la lista" }));

  expect(onOutdated).toHaveBeenCalledTimes(1);
});

test("ends the session when confirming finds no open session", async () => {
  const confirmSupplierPriceList = vi
    .fn<ConfirmSupplierPriceListModalServices["confirmSupplierPriceList"]>()
    .mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ confirmSupplierPriceList, onSessionEnded });

  await confirm(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when confirming comes back forbidden", async () => {
  window.history.pushState(null, "", "/lists");
  const confirmSupplierPriceList = vi
    .fn<ConfirmSupplierPriceListModalServices["confirmSupplierPriceList"]>()
    .mockResolvedValue({ kind: "forbidden" });
  const screen = await renderModal({ confirmSupplierPriceList });

  await confirm(screen);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("cancel closes the modal without calling the cloud", async () => {
  const confirmSupplierPriceList =
    vi.fn<ConfirmSupplierPriceListModalServices["confirmSupplierPriceList"]>();
  const onClose = vi.fn();
  const screen = await renderModal({ confirmSupplierPriceList, onClose });

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(confirmSupplierPriceList).not.toHaveBeenCalled();
});
