import { ANOTHER_FICTIONAL_CUIT, FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import { FieldSizeProvider } from "@purosur/ui";
import { expect, test, vi } from "vitest";
import { ADMINISTRATOR_ACCESS } from "../shell/test-support/backoffice-access";
import { render } from "../shell/test-support/render-with-router";
import { OpenSupplierPanel } from "./open-supplier-panel";
import { createSupplierPanelServices } from "./test-support/supplier-panel-services";
import { suppliersWithCuits } from "./test-support/suppliers";

const { andina, granos, cerealera } = suppliersWithCuits(FICTIONAL_CUIT, ANOTHER_FICTIONAL_CUIT);

function renderOpenPanel({
  openSupplier,
  suppliersAreLoaded = true,
  onClose = () => {},
}: {
  openSupplier: string | undefined;
  suppliersAreLoaded?: boolean;
  onClose?: () => void;
}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <OpenSupplierPanel
        suppliers={[andina, granos]}
        suppliersAreLoaded={suppliersAreLoaded}
        openSupplier={openSupplier}
        tab={undefined}
        access={ADMINISTRATOR_ACCESS}
        services={createSupplierPanelServices()}
        onSessionEnded={() => {}}
        onClose={onClose}
        onEdit={() => {}}
        onDeactivate={() => {}}
        onReactivate={() => {}}
      />
    </FieldSizeProvider>,
  );
}

test("opens the panel of the supplier named", async () => {
  const screen = await renderOpenPanel({ openSupplier: granos.id });

  await expect.element(screen.getByRole("complementary", { name: granos.name })).toBeVisible();
});

test("shows no panel when no supplier is named", async () => {
  const onClose = vi.fn();
  const screen = await renderOpenPanel({ openSupplier: undefined, onClose });

  expect(screen.getByRole("complementary").query()).toBeNull();
  expect(onClose).not.toHaveBeenCalled();
});

test("shows no panel for a supplier the loaded list does not hold, and asks to close it", async () => {
  const onClose = vi.fn();
  const screen = await renderOpenPanel({ openSupplier: cerealera.id, onClose });

  expect(screen.getByRole("complementary").query()).toBeNull();
  await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
});

test("waits for the list to load before asking to close a supplier it does not hold yet", async () => {
  const onClose = vi.fn();
  const screen = await renderOpenPanel({
    openSupplier: cerealera.id,
    suppliersAreLoaded: false,
    onClose,
  });

  expect(screen.getByRole("complementary").query()).toBeNull();
  expect(onClose).not.toHaveBeenCalled();
});
