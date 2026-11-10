import { BRANCH_SETTINGS_DAYS_MAX } from "@purosur/domain";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { BranchTerm } from "./branch-terms";
import {
  ChangeBranchTermModal,
  type ChangeBranchTermModalServices,
} from "./change-branch-term-modal";
import {
  BRANCH_SETTINGS,
  createBranchTermServices,
  SAVED_SETTINGS_REQUEST,
} from "./test-support/branch-term";
import { render } from "./test-support/render-with-router";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

type Handlers = {
  onClose?: () => void;
  onChanged?: () => void;
  onSessionEnded?: () => void;
};

async function renderModal(
  term: BranchTerm,
  services: ChangeBranchTermModalServices = createBranchTermServices(),
  handlers: Handlers = {},
) {
  const screen = await render(
    <FieldSizeProvider size="backoffice">
      <main>
        <ChangeBranchTermModal
          term={term}
          onClose={handlers.onClose ?? (() => {})}
          onChanged={handlers.onChanged ?? (() => {})}
          onSessionEnded={handlers.onSessionEnded ?? (() => {})}
          services={services}
        />
      </main>
    </FieldSizeProvider>,
  );
  return { screen, dialog: screen.getByRole("dialog") };
}

function field(dialog: Awaited<ReturnType<typeof renderModal>>["dialog"], name: string) {
  return dialog.getByRole("textbox", { name });
}

test.each([
  ["expiringLotAlertDays", "Aviso de vencimiento", "30"],
  ["unreviewedPriceAlertDays", "Precio sin revisar", "45"],
  ["goodConditionReturnDays", "Cambio en buen estado", "15"],
  ["supplierPriceListDailyExtractionCap", "Listas leídas por día", "10"],
] as const)(
  "asks only for the %s term, with the value the branch has",
  async (term, label, value) => {
    const { dialog } = await renderModal(term);

    await expect.element(field(dialog, label)).toHaveValue(value);
    expect(dialog.getByRole("textbox").elements()).toHaveLength(1);
    await expectNoAccessibilityViolations(dialog.element());
  },
);

test("explains the daily cap of supplier lists as the Sucursal page does", async () => {
  const { dialog } = await renderModal("supplierPriceListDailyExtractionCap");

  await expect
    .element(
      dialog.getByText(
        "Cuántas listas de proveedores puede leer esta sucursal por día. Al llegar al tope, no se pueden cargar más listas hasta el día siguiente.",
      ),
    )
    .toBeVisible();
});

test("saves the new value with the rest of the settings and the version unchanged", async () => {
  const services = createBranchTermServices();
  const onChanged = vi.fn();
  const { dialog } = await renderModal("expiringLotAlertDays", services, { onChanged });
  await expect.element(field(dialog, "Aviso de vencimiento")).toHaveValue("30");

  await userEvent.fill(field(dialog, "Aviso de vencimiento"), "60");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar" }));

  await expect.poll(() => onChanged.mock.calls.length).toBe(1);
  expect(services.saveBranchSettings).toHaveBeenCalledExactlyOnceWith({
    ...SAVED_SETTINGS_REQUEST,
    expiring_lot_alert_days: 60,
  });
});

test("writes the daily cap through the same setting", async () => {
  const services = createBranchTermServices();
  const { dialog } = await renderModal("supplierPriceListDailyExtractionCap", services);
  await expect.element(field(dialog, "Listas leídas por día")).toHaveValue("10");

  await userEvent.fill(field(dialog, "Listas leídas por día"), "25");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar" }));

  await expect.poll(() => vi.mocked(services.saveBranchSettings).mock.calls.length).toBe(1);
  expect(services.saveBranchSettings).toHaveBeenCalledWith({
    ...SAVED_SETTINGS_REQUEST,
    supplier_price_list_daily_extraction_cap: 25,
  });
});

test.each([
  ["a negative number of days", "-1", "Ingresá un número entero de 0 días o más."],
  ["too many days", String(BRANCH_SETTINGS_DAYS_MAX + 1), "Ingresá un número de días más chico."],
])(
  "refuses %s with the message the Sucursal page shows, without saving",
  async (_name, text, message) => {
    const services = createBranchTermServices();
    const { dialog } = await renderModal("goodConditionReturnDays", services);
    await expect.element(field(dialog, "Cambio en buen estado")).toHaveValue("15");

    await userEvent.fill(field(dialog, "Cambio en buen estado"), text);
    await userEvent.click(dialog.getByRole("button", { name: "Guardar" }));

    await expect.element(dialog.getByText(message)).toBeVisible();
    expect(services.saveBranchSettings).not.toHaveBeenCalled();
  },
);

test("shows the message of the Sucursal page when the cloud refuses the value", async () => {
  const services = createBranchTermServices({
    saveBranchSettings: vi
      .fn()
      .mockResolvedValue({ kind: "validation_failed", field: "unreviewed_price_alert_days" }),
  });
  const { dialog } = await renderModal("unreviewedPriceAlertDays", services);
  await expect.element(field(dialog, "Precio sin revisar")).toHaveValue("45");

  await userEvent.click(dialog.getByRole("button", { name: "Guardar" }));

  await expect.element(dialog.getByText("Revisá el número de días.")).toBeVisible();
});

test("says the branch changed, reads it again and shows the value it has now", async () => {
  const services = createBranchTermServices({
    saveBranchSettings: vi.fn().mockResolvedValue({ kind: "stale_version" }),
  });
  const { dialog } = await renderModal("expiringLotAlertDays", services);
  await expect.element(field(dialog, "Aviso de vencimiento")).toHaveValue("30");
  vi.mocked(services.fetchBranchSettings).mockResolvedValue({
    kind: "ok",
    value: { ...BRANCH_SETTINGS, expiringLotAlertDays: 20, version: 4 },
  });

  await userEvent.fill(field(dialog, "Aviso de vencimiento"), "60");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar" }));

  await expect.element(dialog.getByText("La sucursal cambió mientras la editabas")).toBeVisible();
  await expect.element(field(dialog, "Aviso de vencimiento")).toHaveValue("20");
});

test("reports the end of the session when the save comes back unauthenticated", async () => {
  const services = createBranchTermServices({
    saveBranchSettings: vi.fn().mockResolvedValue({ kind: "unauthenticated" }),
  });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal("expiringLotAlertDays", services, { onSessionEnded });
  await expect.element(field(dialog, "Aviso de vencimiento")).toHaveValue("30");

  await userEvent.click(dialog.getByRole("button", { name: "Guardar" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when the save comes back forbidden", async () => {
  window.history.pushState(null, "", "/stock");
  const services = createBranchTermServices({
    saveBranchSettings: vi.fn().mockResolvedValue({ kind: "forbidden" }),
  });
  const { dialog } = await renderModal("expiringLotAlertDays", services);
  await expect.element(field(dialog, "Aviso de vencimiento")).toHaveValue("30");

  await userEvent.click(dialog.getByRole("button", { name: "Guardar" }));

  await expect
    .poll(() => window.location.pathname + window.location.search)
    .toBe("/?account=credentials");
});

test("says the save failed when the cloud does not answer", async () => {
  const services = createBranchTermServices({
    saveBranchSettings: vi.fn().mockResolvedValue({ kind: "failed" }),
  });
  const { dialog } = await renderModal("expiringLotAlertDays", services);
  await expect.element(field(dialog, "Aviso de vencimiento")).toHaveValue("30");

  await userEvent.click(dialog.getByRole("button", { name: "Guardar" }));

  await expect.element(dialog.getByText("No se pudo guardar la sucursal")).toBeVisible();
});

test("closes without saving on Cancelar", async () => {
  const services = createBranchTermServices();
  const onClose = vi.fn();
  const { dialog } = await renderModal("expiringLotAlertDays", services, { onClose });

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledOnce();
  expect(services.saveBranchSettings).not.toHaveBeenCalled();
});

test("cannot be closed, by its close button or by Escape, while the value is saved", async () => {
  let answerSave: (outcome: { kind: "ok" }) => void = () => {};
  const save = new Promise((resolve) => {
    answerSave = resolve;
  });
  const services = createBranchTermServices({
    saveBranchSettings: vi.fn().mockReturnValue(save),
  });
  const onClose = vi.fn();
  const { screen, dialog } = await renderModal("expiringLotAlertDays", services, { onClose });
  await expect.element(field(dialog, "Aviso de vencimiento")).toHaveValue("30");
  await expect.element(dialog.getByRole("button", { name: "Cerrar" })).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Guardar" }));
  await expect.element(dialog.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  await userEvent.keyboard("{Escape}");

  expect(onClose).not.toHaveBeenCalled();
  expect(dialog.getByRole("button", { name: "Cerrar" }).query()).toBeNull();
  await expect.element(screen.getByRole("dialog")).toBeVisible();
  answerSave({ kind: "ok" });
});

test("offers to read the branch again when it cannot be loaded", async () => {
  const services = createBranchTermServices({
    fetchBranchSettings: vi.fn().mockResolvedValue({ kind: "failed" }),
  });
  const { dialog } = await renderModal("expiringLotAlertDays", services);

  await expect.element(dialog.getByRole("button", { name: "Reintentar" })).toBeVisible();
});
