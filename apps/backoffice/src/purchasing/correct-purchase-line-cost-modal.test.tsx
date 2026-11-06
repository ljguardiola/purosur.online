import type { PurchaseSummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  CorrectPurchaseLineCostModal,
  type CorrectPurchaseLineCostModalServices,
  type PurchaseLineCostTarget,
} from "./correct-purchase-line-cost-modal";
import { compraDeAvena, compraDeMiel } from "./test-support/purchases";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

const [lineDeMiel] = compraDeMiel.lines;
const [lineDeAvena] = compraDeAvena.lines;
if (!lineDeMiel || !lineDeAvena) {
  throw new Error("test setup: a purchase has no line");
}

const miel: PurchaseLineCostTarget = { purchase: compraDeMiel, line: lineDeMiel };
const avena: PurchaseLineCostTarget = { purchase: compraDeAvena, line: lineDeAvena };

const corrected: PurchaseSummary = {
  ...compraDeMiel,
  lines: [{ ...lineDeMiel, costPaidCents: 6_800_00 }],
};

function createServices(
  overrides: Partial<CorrectPurchaseLineCostModalServices> = {},
): CorrectPurchaseLineCostModalServices {
  return {
    correctPurchaseLineCost:
      vi.fn<CorrectPurchaseLineCostModalServices["correctPurchaseLineCost"]>(),
    ...overrides,
  };
}

type ModalOptions = {
  target?: PurchaseLineCostTarget | null;
  services?: CorrectPurchaseLineCostModalServices;
  onSaved?: (purchase: PurchaseSummary) => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
};

function renderModal({
  target = miel,
  services = createServices(),
  onSaved = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: ModalOptions = {}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <CorrectPurchaseLineCostModal
          target={target}
          services={services}
          onSaved={onSaved}
          onClose={onClose}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>,
  );
}

type ModalScreen = Awaited<ReturnType<typeof renderModal>>;

async function readyDialog(screen: ModalScreen) {
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("textbox", { name: /^Costo pagado/ })).toBeVisible();
  return dialog;
}

async function save(screen: ModalScreen) {
  const dialog = await readyDialog(screen);
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el costo" }));
  return dialog;
}

function servicesAnswering(
  outcome: Awaited<ReturnType<CorrectPurchaseLineCostModalServices["correctPurchaseLineCost"]>>,
) {
  const correctPurchaseLineCost = vi
    .fn<CorrectPurchaseLineCostModalServices["correctPurchaseLineCost"]>()
    .mockResolvedValue(outcome);
  return { correctPurchaseLineCost, services: createServices({ correctPurchaseLineCost }) };
}

test("shows the line's product as the title with its current cost filled", async () => {
  const screen = await renderModal();
  const dialog = await readyDialog(screen);

  await expect.element(dialog.getByText("Stock · Compra")).toBeVisible();
  await expect
    .element(dialog.getByRole("heading", { name: "Miel pura de abeja 1 kg" }))
    .toBeVisible();
  await expect
    .element(dialog.getByRole("textbox", { name: /^Costo pagado por paquete/ }))
    .toHaveValue("7.200,00");
});

test("saves the corrected cost and hands the corrected purchase over", async () => {
  const { correctPurchaseLineCost, services } = servicesAnswering({
    kind: "ok",
    purchase: corrected,
  });
  const onSaved = vi.fn();
  const screen = await renderModal({ services, onSaved });

  const dialog = await readyDialog(screen);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Costo pagado/ }), "6.800");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el costo" }));

  await expect.poll(() => onSaved.mock.calls).toEqual([[corrected]]);
  expect(correctPurchaseLineCost).toHaveBeenCalledWith(compraDeMiel.id, lineDeMiel.id, {
    costPaidCents: 6_800_00,
  });
});

test("asks for a cost when it is emptied, without calling the cloud", async () => {
  const { correctPurchaseLineCost, services } = servicesAnswering({ kind: "failed" });
  const screen = await renderModal({ services });

  const dialog = await readyDialog(screen);
  await userEvent.clear(dialog.getByRole("textbox", { name: /^Costo pagado/ }));
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el costo" }));

  await expect
    .element(
      dialog.getByText("Escribí el costo pagado con hasta 2 decimales, por ejemplo 1.250,50."),
    )
    .toBeVisible();
  expect(correctPurchaseLineCost).not.toHaveBeenCalled();
});

test("starts from the line it opens for each time", async () => {
  const screen = await renderModal({ target: avena });
  const dialog = await readyDialog(screen);

  await expect.element(dialog.getByRole("heading", { name: "Avena arrollada" })).toBeVisible();
  await expect
    .element(dialog.getByRole("textbox", { name: /^Costo pagado por kg/ }))
    .toHaveValue("2.000,00");
});

test("says the purchase no longer exists", async () => {
  const { services } = servicesAnswering({ kind: "not_found" });
  const screen = await renderModal({ services });

  const dialog = await save(screen);

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Esta compra ya no existe");
});

test("shows a cost the cloud refused on its field", async () => {
  const { services } = servicesAnswering({ kind: "validation_failed", field: "costPaidCents" });
  const screen = await renderModal({ services });

  const dialog = await save(screen);

  await expect
    .element(
      dialog.getByText("Escribí el costo pagado con hasta 2 decimales, por ejemplo 1.250,50."),
    )
    .toBeVisible();
  expect(dialog.getByText("No se corrigió el costo").query()).toBeNull();
});

test("says there is nothing to save when the line already has that cost, handing nothing over", async () => {
  const { services } = servicesAnswering({ kind: "unchanged" });
  const onSaved = vi.fn();
  const screen = await renderModal({ services, onSaved });

  const dialog = await save(screen);

  await expect.element(dialog.getByText("No hay cambios para guardar").first()).toBeVisible();
  expect(onSaved).not.toHaveBeenCalled();
});

test("cannot be closed while the correction is being saved", async () => {
  const correctPurchaseLineCost = vi
    .fn<CorrectPurchaseLineCostModalServices["correctPurchaseLineCost"]>()
    .mockReturnValue(new Promise(() => {}));
  const screen = await renderModal({ services: createServices({ correctPurchaseLineCost }) });

  const dialog = await save(screen);

  await expect.element(dialog.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  expect(dialog.getByRole("button", { name: "Cerrar" }).query()).toBeNull();
});

test("shows the failure notice", async () => {
  const { services } = servicesAnswering({ kind: "failed" });
  const screen = await renderModal({ services });

  const dialog = await save(screen);

  await expect.element(dialog.getByText("No se corrigió el costo")).toBeVisible();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const { services } = servicesAnswering({ kind: "rate_limited", retryAfterSeconds: 60 });
  const screen = await renderModal({ services });

  const dialog = await save(screen);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
});

test("ends the session when saving finds no open session", async () => {
  const { services } = servicesAnswering({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ services, onSessionEnded });

  await save(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when saving comes back forbidden", async () => {
  window.history.pushState(null, "", "/purchases");
  const { services } = servicesAnswering({ kind: "forbidden" });
  const screen = await renderModal({ services });

  await save(screen);

  await expect
    .poll(() => window.location.pathname + window.location.search)
    .toBe("/?account=credentials");
});

test("opens nothing without a line", async () => {
  const screen = await renderModal({ target: null });

  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("cancel closes the modal without calling the cloud", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const screen = await renderModal({ services, onClose });

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(services.correctPurchaseLineCost).not.toHaveBeenCalled();
});

test("has no accessibility violations", async () => {
  const screen = await renderModal();
  await readyDialog(screen);

  await expectNoAccessibilityViolations(screen.getByRole("dialog").element());
});
