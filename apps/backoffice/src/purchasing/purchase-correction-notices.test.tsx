import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test } from "vitest";
import { render } from "../shell/test-support/render-with-router";
import {
  type PurchaseCorrectionNotice,
  PurchaseCorrectionNotices,
} from "./purchase-correction-notices";

function renderNotice(notice: PurchaseCorrectionNotice | null) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <PurchaseCorrectionNotices notice={notice} failedTitle="No se guardó el cambio" />
      </main>
    </FieldSizeProvider>,
  );
}

test("shows nothing without a notice", async () => {
  const screen = await renderNotice(null);

  expect(screen.getByRole("alert").query()).toBeNull();
});

test("says the change was not saved, with the title the modal gives it", async () => {
  const screen = await renderNotice({ kind: "attemptFailed" });

  await expect.element(screen.getByText("No se guardó el cambio")).toBeVisible();
  await expect.element(screen.getByText("Volvé a intentarlo.")).toBeVisible();
});

test("says how long to wait when the cloud rate-limits the request", async () => {
  const screen = await renderNotice({ kind: "rateLimited", retryAfterSeconds: 120 });

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("says the purchase no longer exists", async () => {
  const screen = await renderNotice({ kind: "notFound" });

  await expect.element(screen.getByRole("alert")).toHaveTextContent("Esta compra ya no existe");
});

test("has no accessibility violations", async () => {
  const screen = await renderNotice({ kind: "notFound" });

  await expectNoAccessibilityViolations(screen.container);
});
