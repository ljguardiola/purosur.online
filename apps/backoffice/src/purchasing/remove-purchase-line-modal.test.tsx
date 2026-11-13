import type { PurchaseSummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  type PurchaseLineRemovalTarget,
  RemovePurchaseLineModal,
  type RemovePurchaseLineModalServices,
} from "./remove-purchase-line-modal";
import { compraDeAvena, compraDeMiel } from "./test-support/purchases";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

const [lineDeMiel] = compraDeMiel.lines;
const [lineDeAvena] = compraDeAvena.lines;
if (!lineDeMiel || !lineDeAvena) {
  throw new Error("test setup: a purchase has no line");
}

const miel: PurchaseLineRemovalTarget = { purchase: compraDeMiel, line: lineDeMiel };
const avena: PurchaseLineRemovalTarget = { purchase: compraDeAvena, line: lineDeAvena };

const removed: PurchaseSummary = { ...compraDeMiel, purchasedOn: "2026-09-13" };

type Remove = RemovePurchaseLineModalServices["removePurchaseLine"];

function servicesAnswering(outcome: Awaited<ReturnType<Remove>>) {
  const removePurchaseLine = vi.fn<Remove>().mockResolvedValue(outcome);
  return { removePurchaseLine, services: { removePurchaseLine } };
}

type ModalOptions = {
  target?: PurchaseLineRemovalTarget | null;
  services?: RemovePurchaseLineModalServices;
  onRemoved?: (purchase: PurchaseSummary) => void;
  onStale?: () => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
};

function modal({
  target = miel,
  services = { removePurchaseLine: vi.fn<Remove>() },
  onRemoved = () => {},
  onStale = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: ModalOptions = {}) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <RemovePurchaseLineModal
          target={target}
          services={services}
          onRemoved={onRemoved}
          onStale={onStale}
          onClose={onClose}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>
  );
}

function renderModal(options: ModalOptions = {}) {
  return render(modal(options));
}

type ModalScreen = Awaited<ReturnType<typeof renderModal>>;

async function confirm(screen: ModalScreen) {
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Quitar el producto" }));
  return dialog;
}

test("asks to remove the product naming its quantity and the cost paid", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");

  await expect
    .element(
      dialog.getByRole("heading", { name: '¿Quitar "Miel pura de abeja 1 kg" de la compra?' }),
    )
    .toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "Salen del stock 2 × 12 u (24 u) con un costo pagado de $ 7.200,00 por paquete.",
      ),
    )
    .toBeVisible();
});

test("names a line loaded by quantity in kilos", async () => {
  const screen = await renderModal({ target: avena });

  await expect
    .element(
      screen
        .getByRole("dialog")
        .getByText("Salen del stock 12,500 kg con un costo pagado de $ 2.000,00 por kg."),
    )
    .toBeVisible();
});

test("removes the line and hands the purchase over", async () => {
  const { removePurchaseLine, services } = servicesAnswering({ kind: "ok", purchase: removed });
  const onRemoved = vi.fn();
  const screen = await renderModal({ services, onRemoved });

  await confirm(screen);

  await expect.poll(() => onRemoved.mock.calls).toEqual([[removed]]);
  expect(removePurchaseLine).toHaveBeenCalledWith(compraDeMiel.id, lineDeMiel.id);
});

test("removes with Ctrl+Enter", async () => {
  const { removePurchaseLine, services } = servicesAnswering({ kind: "ok", purchase: removed });
  await renderModal({ services });

  await userEvent.keyboard("{Control>}{Enter}{/Control}");

  await expect.poll(() => removePurchaseLine.mock.calls.length).toBe(1);
});

test.each([
  [
    "units_left_lot",
    "Ya salieron unidades del lote de esta línea; corregí el stock con un ajuste.",
  ],
  [
    "counted_since_receipt",
    "Se contó el stock después de recibir la compra; corregí el stock con un ajuste.",
  ],
  ["last_line", "Es la única línea de la compra; no se puede quitar."],
] as const)(
  "says why a %s refusal removed nothing and asks for the purchases again",
  async (kind, description) => {
    const { services } = servicesAnswering({ kind });
    const onStale = vi.fn();
    const onRemoved = vi.fn();
    const screen = await renderModal({ services, onStale, onRemoved });

    const dialog = await confirm(screen);

    await expect.element(dialog.getByText("No se quitó el producto")).toBeVisible();
    await expect.element(dialog.getByText(description)).toBeVisible();
    expect(onStale).toHaveBeenCalledTimes(1);
    expect(onRemoved).not.toHaveBeenCalled();
  },
);

test("says the purchase no longer exists", async () => {
  const { services } = servicesAnswering({ kind: "not_found" });
  const screen = await renderModal({ services });

  const dialog = await confirm(screen);

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Esta compra ya no existe");
});

test("cannot be closed while the line is being removed", async () => {
  const removePurchaseLine = vi.fn<Remove>().mockReturnValue(new Promise(() => {}));
  const screen = await renderModal({ services: { removePurchaseLine } });

  const dialog = await confirm(screen);

  await expect.element(dialog.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  await expect.element(dialog.getByRole("button", { name: "Quitar el producto" })).toBeDisabled();
});

test("shows the failure notice and lets it be tried again", async () => {
  const { services } = servicesAnswering({ kind: "failed" });
  const screen = await renderModal({ services });

  const dialog = await confirm(screen);

  await expect.element(dialog.getByText("No se quitó el producto")).toBeVisible();
  await expect.element(dialog.getByText("Volvé a intentarlo.")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Quitar el producto" })).toBeEnabled();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const { services } = servicesAnswering({ kind: "rate_limited", retryAfterSeconds: 60 });
  const screen = await renderModal({ services });

  const dialog = await confirm(screen);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
});

test("ends the session when removing finds no open session", async () => {
  const { services } = servicesAnswering({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ services, onSessionEnded });

  await confirm(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("opens the own account panel when removing comes back forbidden", async () => {
  window.history.pushState(null, "", "/purchases");
  const { services } = servicesAnswering({ kind: "forbidden" });
  const screen = await renderModal({ services });

  await confirm(screen);

  await expect
    .poll(() => window.location.pathname + window.location.search)
    .toBe("/?account=credentials");
});

test("opens nothing without a line", async () => {
  const screen = await renderModal({ target: null });

  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("cancel closes the modal without calling the cloud", async () => {
  const services = { removePurchaseLine: vi.fn<Remove>() };
  const onClose = vi.fn();
  const screen = await renderModal({ services, onClose });

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(services.removePurchaseLine).not.toHaveBeenCalled();
});

test("has no accessibility violations", async () => {
  const screen = await renderModal();

  await expectNoAccessibilityViolations(screen.getByRole("dialog").element());
});
