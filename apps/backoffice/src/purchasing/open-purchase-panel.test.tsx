import { FieldSizeProvider } from "@purosur/ui";
import { beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { ADMINISTRATOR_ACCESS } from "../shell/test-support/backoffice-access";
import { render } from "../shell/test-support/render-with-router";
import { OpenPurchasePanel } from "./open-purchase-panel";
import { createPanelServices } from "./test-support/purchase-panel";
import { compraDeAvena, compraDeMiel } from "./test-support/purchases";

beforeEach(async () => {
  await page.viewport(1280, 900);
  window.history.pushState(null, "", "/");
});

const UNLISTED_PURCHASE = "c0a00000-0000-4000-8000-0000000000ff";

function renderOpenPanel({
  openPurchase,
  purchasesAreLoaded = true,
  onClose = () => {},
}: {
  openPurchase: string | undefined;
  purchasesAreLoaded?: boolean;
  onClose?: () => void;
}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <OpenPurchasePanel
        purchases={[compraDeMiel, compraDeAvena]}
        purchasesAreLoaded={purchasesAreLoaded}
        openPurchase={openPurchase}
        access={ADMINISTRATOR_ACCESS}
        services={createPanelServices()}
        onClose={onClose}
        onCorrected={() => {}}
        onCorrectionStarted={() => {}}
        onStale={() => {}}
        onSessionEnded={() => {}}
      />
    </FieldSizeProvider>,
  );
}

test("opens the panel of the purchase named", async () => {
  const screen = await renderOpenPanel({ openPurchase: compraDeAvena.id });

  await expect
    .element(screen.getByRole("complementary", { name: "Compra a Granos del Valle" }))
    .toBeVisible();
});

test("shows no panel when no purchase is named", async () => {
  const onClose = vi.fn();
  const screen = await renderOpenPanel({ openPurchase: undefined, onClose });

  expect(screen.getByRole("complementary").query()).toBeNull();
  expect(onClose).not.toHaveBeenCalled();
});

test("shows no panel for a purchase the loaded list does not hold, and asks to close it", async () => {
  const onClose = vi.fn();
  const screen = await renderOpenPanel({ openPurchase: UNLISTED_PURCHASE, onClose });

  expect(screen.getByRole("complementary").query()).toBeNull();
  await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
});

test("waits for the list to load before asking to close a purchase it does not hold yet", async () => {
  const onClose = vi.fn();
  const screen = await renderOpenPanel({
    openPurchase: UNLISTED_PURCHASE,
    purchasesAreLoaded: false,
    onClose,
  });

  expect(screen.getByRole("complementary").query()).toBeNull();
  expect(onClose).not.toHaveBeenCalled();
});
