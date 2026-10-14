import type { Freight, FreightSummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { EditFreightModal, type EditFreightModalServices } from "./edit-freight-modal";
import { fillFreight, toggle } from "./test-support/freight-form-fill";
import {
  compraAndina,
  compraMolinos,
  envioDesdeBuenosAires,
  recordedEnvio,
  retiroEnElMolino,
} from "./test-support/freights";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function createServices(
  overrides: Partial<EditFreightModalServices> = {},
): EditFreightModalServices {
  return {
    editFreight: vi.fn<EditFreightModalServices["editFreight"]>(),
    fetchLinkablePurchases: vi
      .fn<EditFreightModalServices["fetchLinkablePurchases"]>()
      .mockResolvedValue({ kind: "ok", value: [compraAndina, compraMolinos] }),
    ...overrides,
  };
}

type ModalOptions = {
  target?: FreightSummary | null;
  services?: EditFreightModalServices;
  period?: 30 | 90 | 365;
  onSaved?: (freight: Freight) => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
};

function modalElement({
  target = envioDesdeBuenosAires,
  services = createServices(),
  period = 90,
  onSaved = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: ModalOptions = {}) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <EditFreightModal
          target={target}
          period={period}
          services={services}
          onSaved={onSaved}
          onClose={onClose}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>
  );
}

function renderModal(options: ModalOptions = {}) {
  return render(modalElement(options));
}

type ModalScreen = Awaited<ReturnType<typeof renderModal>>;

async function readyDialog(screen: ModalScreen) {
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("checkbox", { name: "Distribuidora Andina" })).toBeVisible();
  return dialog;
}

async function save(screen: ModalScreen) {
  const dialog = await readyDialog(screen);
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  return dialog;
}

test("shows the freight's description as the title, with its values filled and its purchases checked", async () => {
  const screen = await renderModal();
  const dialog = await readyDialog(screen);

  await expect.element(dialog.getByText("Stock · Flete")).toBeVisible();
  await expect
    .element(dialog.getByRole("heading", { name: "Envío desde Buenos Aires" }))
    .toBeVisible();
  const date = dialog.getByRole("group", { name: /^Fecha/ }).getByRole("spinbutton");
  await expect
    .poll(() => date.all().map((segment) => segment.element().textContent))
    .toEqual(["12", "9", "2026"]);
  await expect.element(dialog.getByRole("textbox", { name: /^Monto/ })).toHaveValue("18500,00");
  await expect.element(dialog.getByRole("textbox", { name: /^Medio/ })).toHaveValue("Expreso Sur");
  await expect
    .element(dialog.getByRole("textbox", { name: /^Descripción/ }))
    .toHaveValue("Envío desde Buenos Aires");
  await expect.element(dialog.getByRole("checkbox", { name: "Distribuidora Andina" })).toBeChecked();
  await expect.element(dialog.getByRole("checkbox", { name: "Molinos del Valle" })).toBeChecked();
});

test("reads the purchases of the period together with the ones the freight already covers", async () => {
  const services = createServices();
  await renderModal({ services, period: 365 });

  await expect.poll(() => vi.mocked(services.fetchLinkablePurchases).mock.calls).toEqual([
    [{ period: 365, freightId: envioDesdeBuenosAires.id }],
  ]);
});

test("shows a freight of the store's own trip with its carrier disabled", async () => {
  const screen = await renderModal({ target: retiroEnElMolino });
  const dialog = await readyDialog(screen);

  await expect
    .element(dialog.getByRole("checkbox", { name: "Viaje propio (costo estimado)" }))
    .toBeChecked();
  await expect.element(dialog.getByRole("textbox", { name: /^Medio/ })).toBeDisabled();
});

test("saves the changed freight and hands it over", async () => {
  const editFreight = vi
    .fn<EditFreightModalServices["editFreight"]>()
    .mockResolvedValue({ kind: "ok", freight: recordedEnvio });
  const onSaved = vi.fn();
  const screen = await renderModal({ services: createServices({ editFreight }), onSaved });

  const dialog = await readyDialog(screen);
  await fillFreight(dialog, { amount: "20000,50" });
  await toggle(dialog, "Molinos del Valle");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => onSaved.mock.calls).toEqual([[recordedEnvio]]);
  expect(editFreight).toHaveBeenCalledWith(envioDesdeBuenosAires.id, {
    date: "2026-09-12",
    amountCents: 2_000_050,
    description: "Envío desde Buenos Aires",
    means: { kind: "carrier", name: "Expreso Sur" },
    purchaseIds: [compraAndina.id],
  });
});

test("refuses a freight left without purchases without calling the cloud", async () => {
  const editFreight = vi.fn<EditFreightModalServices["editFreight"]>();
  const screen = await renderModal({ services: createServices({ editFreight }) });

  const dialog = await readyDialog(screen);
  await toggle(dialog, "Distribuidora Andina");
  await toggle(dialog, "Molinos del Valle");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Elegí al menos una compra.")).toBeVisible();
  expect(editFreight).not.toHaveBeenCalled();
});

test("shows a field the cloud refused under that field", async () => {
  const editFreight = vi
    .fn<EditFreightModalServices["editFreight"]>()
    .mockResolvedValue({ kind: "validation_failed", field: "description" });
  const screen = await renderModal({ services: createServices({ editFreight }) });

  const dialog = await save(screen);

  await expect
    .element(dialog.getByText(/^La descripción puede tener hasta \d+ caracteres\.$/))
    .toBeVisible();
});

test("says the freight no longer exists", async () => {
  const editFreight = vi
    .fn<EditFreightModalServices["editFreight"]>()
    .mockResolvedValue({ kind: "not_found" });
  const screen = await renderModal({ services: createServices({ editFreight }) });

  const dialog = await save(screen);

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Este flete ya no existe");
});

test("says the linked purchases are worth nothing to distribute the freight over", async () => {
  const editFreight = vi
    .fn<EditFreightModalServices["editFreight"]>()
    .mockResolvedValue({ kind: "purchases_without_value" });
  const screen = await renderModal({ services: createServices({ editFreight }) });

  const dialog = await save(screen);

  await expect.element(dialog.getByText("Las compras vinculadas no tienen valor")).toBeVisible();
});

test("asks again for the purchases when one of them is gone", async () => {
  const editFreight = vi
    .fn<EditFreightModalServices["editFreight"]>()
    .mockResolvedValue({ kind: "purchase_not_found" });
  const services = createServices({ editFreight });
  const screen = await renderModal({ services });

  const dialog = await save(screen);

  await expect
    .element(dialog.getByText("Alguna de las compras ya no está disponible. Elegí otras."))
    .toBeVisible();
  await expect.poll(() => vi.mocked(services.fetchLinkablePurchases).mock.calls.length).toBe(2);
});

test("shows the failure notice", async () => {
  const editFreight = vi
    .fn<EditFreightModalServices["editFreight"]>()
    .mockResolvedValue({ kind: "failed" });
  const screen = await renderModal({ services: createServices({ editFreight }) });

  const dialog = await save(screen);

  await expect.element(dialog.getByText("No se guardó el flete")).toBeVisible();
  await expect.element(dialog.getByText("Volvé a intentarlo.")).toBeVisible();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const editFreight = vi.fn<EditFreightModalServices["editFreight"]>().mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 60,
  });
  const screen = await renderModal({ services: createServices({ editFreight }) });

  const dialog = await save(screen);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
});

test("ends the session when saving finds no open session", async () => {
  const editFreight = vi
    .fn<EditFreightModalServices["editFreight"]>()
    .mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ services: createServices({ editFreight }), onSessionEnded });

  await save(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when saving comes back forbidden", async () => {
  window.history.pushState(null, "", "/freights");
  const editFreight = vi
    .fn<EditFreightModalServices["editFreight"]>()
    .mockResolvedValue({ kind: "forbidden" });
  const screen = await renderModal({ services: createServices({ editFreight }) });

  await save(screen);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("holds the changes until the purchases have loaded", async () => {
  const fetchLinkablePurchases = vi
    .fn<EditFreightModalServices["fetchLinkablePurchases"]>()
    .mockReturnValue(new Promise(() => {}));
  const screen = await renderModal({ services: createServices({ fetchLinkablePurchases }) });

  await expect
    .element(screen.getByRole("dialog").getByRole("button", { name: "Guardar los cambios" }))
    .toBeDisabled();
});

test("opens nothing without a freight", async () => {
  const screen = await renderModal({ target: null });

  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("cancel closes the modal without calling the cloud", async () => {
  const editFreight = vi.fn<EditFreightModalServices["editFreight"]>();
  const onClose = vi.fn();
  const screen = await renderModal({ services: createServices({ editFreight }), onClose });

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(editFreight).not.toHaveBeenCalled();
});

test("has no accessibility violations", async () => {
  const screen = await renderModal();
  await readyDialog(screen);

  await expectNoAccessibilityViolations(screen.getByRole("dialog").element());
});
