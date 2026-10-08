import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { PendingRefundsScreen } from "./pending-refunds-screen";
import type { PendingRefundsScreenServices } from "./pending-refunds-services";
import {
  noPendingRefunds,
  pendingRefunds,
  SECOND_REFUND_ID,
  TRANSFER_REFUND_ID,
} from "./test-support/refund-fixtures";

function createServices(): PendingRefundsScreenServices {
  return { fetchPendingRefunds: vi.fn(), markRefundDone: vi.fn() };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function renderScreen(services: PendingRefundsScreenServices, onSessionEnded = () => {}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <PendingRefundsScreen services={services} onSessionEnded={onSessionEnded} />
      </main>
    </FieldSizeProvider>,
  );
}

async function loaded(services: PendingRefundsScreenServices) {
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({ kind: "ok", value: pendingRefunds });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("table", { name: "Reembolsos pendientes" })).toBeVisible();
  return screen;
}

test("shows the breadcrumb, the heading and each pending refund with when, where, how, how much and who cancelled", async () => {
  const services = createServices();
  const screen = await loaded(services);

  await expect.element(screen.getByText("Caja", { exact: true }).first()).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Reembolsos pendientes", level: 1 }))
    .toBeVisible();
  const rowTexts = () =>
    screen
      .getByRole("row")
      .all()
      .slice(1)
      .map((row) => row.element().textContent ?? "");
  await expect.poll(() => rowTexts().length).toBe(2);
  const rows = rowTexts();
  expect(rows[0]).toContain("07/10/2026 12:30");
  expect(rows[0]).toContain("Caja principal");
  expect(rows[0]).toContain("Transferencia");
  expect(rows[0]).toContain("$ 2.500,00");
  expect(rows[0]).toContain("Lucía");
  expect(rows[1]).toContain("07/10/2026 15:05");
  expect(rows[1]).toContain("Caja del fondo");
  await expectNoAccessibilityViolations(screen.container);
});

test("shows the empty state when no refund is pending", async () => {
  const services = createServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: noPendingRefunds,
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No hay reembolsos pendientes")).toBeVisible();
});

test("shows the table loading while the refunds load", async () => {
  const services = createServices();
  const firstLoad = deferred<Awaited<ReturnType<typeof services.fetchPendingRefunds>>>();
  vi.mocked(services.fetchPendingRefunds).mockReturnValueOnce(firstLoad.promise);

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("table", { name: "Reembolsos pendientes" }))
    .toHaveAttribute("aria-busy", "true");
});

test("shows a load error with a retry action that starts again from the loading placeholder", async () => {
  const services = createServices();
  const retry = deferred<Awaited<ReturnType<typeof services.fetchPendingRefunds>>>();
  vi.mocked(services.fetchPendingRefunds)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retry.promise);
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByText("No pudimos abrir los reembolsos pendientes"))
    .toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByRole("table", { name: "Reembolsos pendientes" }))
    .toHaveAttribute("aria-busy", "true");
  retry.resolve({ kind: "ok", value: pendingRefunds });
  await expect.element(screen.getByText("Caja principal")).toBeVisible();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const services = createServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("navigates to Mi cuenta when the refunds request comes back forbidden", async () => {
  window.history.pushState(null, "", "/pending-refunds");
  const services = createServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
  window.history.pushState(null, "", "/");
});

test("ends the session when the refunds request finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("marking a refund as done asks first, then marks it and the refund leaves the list", async () => {
  const services = createServices();
  vi.mocked(services.markRefundDone).mockResolvedValue({ kind: "ok" });
  const screen = await loaded(services);

  await userEvent.click(
    screen.getByRole("button", { name: "Marcar como hecho el reembolso de $ 2.500,00" }),
  );
  const dialog = screen.getByRole("dialog");
  await expect
    .element(
      dialog.getByRole("heading", { name: "¿Marcar como hecho el reembolso de $ 2.500,00?" }),
    )
    .toBeVisible();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: { refunds: pendingRefunds.refunds.filter((refund) => refund.id === SECOND_REFUND_ID) },
  });
  await userEvent.click(dialog.getByRole("button", { name: "Marcar como hecho" }));

  expect(services.markRefundDone).toHaveBeenCalledWith(TRANSFER_REFUND_ID);
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => screen.getByText("Caja principal").query()).toBeNull();
  await expect.element(screen.getByText("Caja del fondo")).toBeVisible();
});

test("a refund another person already marked as done leaves the list once the list is updated", async () => {
  const services = createServices();
  vi.mocked(services.markRefundDone).mockResolvedValue({ kind: "already_done" });
  const screen = await loaded(services);
  await userEvent.click(
    screen.getByRole("button", { name: "Marcar como hecho el reembolso de $ 2.500,00" }),
  );
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Marcar como hecho" }));
  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Ya estaba marcado como hecho");
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: { refunds: pendingRefunds.refunds.filter((refund) => refund.id === SECOND_REFUND_ID) },
  });

  await userEvent.click(dialog.getByRole("button", { name: "Actualizar la lista" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => screen.getByText("Caja principal").query()).toBeNull();
});

test("cancel closes the question and the refund stays listed", async () => {
  const services = createServices();
  const screen = await loaded(services);
  await userEvent.click(
    screen.getByRole("button", { name: "Marcar como hecho el reembolso de $ 2.500,00" }),
  );

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Caja principal")).toBeVisible();
  expect(services.markRefundDone).not.toHaveBeenCalled();
});
