import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { createQueryClient } from "../platform/query-client";
import { render } from "../shell/test-support/render-with-router";
import { PendingRefundsScreen } from "./pending-refunds-screen";
import type { PendingRefundsScreenServices } from "./pending-refunds-services";
import { type PendingRefundsFilters, pendingRefundsFilters } from "./routes";
import {
  CLOUD_SENT_REFUND_ID,
  LATE_PAYMENT_REFUND_ID,
  noPendingRefunds,
  pendingRefunds,
  pendingRefundsOfEveryCloudRefundStage,
  pendingRefundsWithConfirmedLatePayment,
  pendingRefundsWithLatePayment,
  pendingRefundsWithLatePaymentOfOtherOrder,
  pendingRefundsWithLatePointPayment,
  pendingRefundsWithUnconfirmedCloudRefund,
  SECOND_REFUND_ID,
  TRANSFER_REFUND_ID,
} from "./test-support/refund-fixtures";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function createServices(): PendingRefundsScreenServices {
  return {
    fetchPendingRefunds: vi.fn(),
    markRefundDone: vi.fn(),
    discardRefund: vi.fn(),
    confirmRefund: vi.fn(),
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function renderScreen(
  services: PendingRefundsScreenServices,
  onSessionEnded = () => {},
  {
    filters = pendingRefundsFilters.parse({}),
    onFiltersChange = () => {},
  }: {
    filters?: PendingRefundsFilters;
    onFiltersChange?: (filters: PendingRefundsFilters) => void;
  } = {},
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <PendingRefundsScreen
          services={services}
          onSessionEnded={onSessionEnded}
          filters={filters}
          onFiltersChange={onFiltersChange}
        />
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

test("shows the breadcrumb, the heading and each pending refund with since when, why, how, how much", async () => {
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
  expect(rows[0]).toContain("07/10/2026");
  expect(rows[0]).toContain("hace 3 horas");
  expect(rows[0]).toContain("Venta cancelada");
  expect(rows[0]).toContain("La venta del 07/10 12:30 se canceló · la canceló Lucía");
  expect(rows[0]).toContain("Transferencia");
  expect(rows[0]).toContain("$ 2.500,00");
  expect(rows[1]).toContain("hace 20 minutos");
  expect(rows[1]).not.toContain("la canceló");
  expect(rows[1]).toContain("$ 980,00");
  await expectNoAccessibilityViolations(screen.container);
});

test("heads the list by since when, why, how and how much, with no column for the register or the canceller", async () => {
  const services = createServices();
  const screen = await loaded(services);

  const headers = screen
    .getByRole("columnheader")
    .all()
    .map((header) => header.element().textContent?.trim());
  expect(headers.slice(0, 4)).toEqual(["Pendiente desde", "Por qué", "Medio", "Importe"]);
  await expect
    .element(screen.getByRole("columnheader", { name: "Cancelada por" }))
    .not.toBeInTheDocument();
  await expect.element(screen.getByRole("columnheader", { name: "Caja" })).not.toBeInTheDocument();
});

test("tells, in the method cell of a refund for a second paid order, the order Mercado Pago gave, and in no other row", async () => {
  const services = createServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: pendingRefundsWithLatePaymentOfOtherOrder,
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("$ 1.180,00", { exact: true })).toBeVisible();

  const rows = screen
    .getByRole("row")
    .all()
    .slice(1)
    .map((row) => row.element().textContent ?? "");
  expect(rows).toHaveLength(2);
  expect(rows[0]).not.toContain("Orden");
  expect(rows[1]).toContain("Aprobación tardía");
  expect(rows[1]).toContain("QR de Mercado Pago");
  expect(rows[1]).toContain("Orden ORD01JQ4S4KY8HWQ6NA5PXB65B3D3");
  await expectNoAccessibilityViolations(screen.container);
});

test("lists a cancelled sale's refund and a late QR payment's refund together, each with its reason, its original channel and, for the late payment, how the sale was charged", async () => {
  const services = createServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: pendingRefundsWithLatePayment,
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("$ 1.250,00", { exact: true })).toBeVisible();

  const rows = screen
    .getByRole("row")
    .all()
    .slice(1)
    .map((row) => row.element().textContent ?? "");
  expect(rows).toHaveLength(2);
  expect(rows[0]).toContain("Venta cancelada");
  expect(rows[0]).toContain("Transferencia");
  expect(rows[1]).toContain("08/10/2026");
  expect(rows[1]).toContain("hace 27 horas");
  expect(rows[1]).toContain("Aprobación tardía");
  expect(rows[1]).toContain(
    "El QR de la venta del 08/10 09:37 se pagó después de cobrarla con transferencia",
  );
  expect(rows[1]).toContain("QR de Mercado Pago");
  expect(rows[1]).not.toContain("Efectivo");
  expect(rows[1]).not.toContain("Sin dato");
  await expectNoAccessibilityViolations(screen.container);
});

test("explains under the table that QR refunds of cancelled sales and late payments are sent to Mercado Pago from here, only once confirmed, and the others are made outside the system and marked as done", async () => {
  const services = createServices();
  const screen = await loaded(services);

  await expect
    .element(
      screen.getByText(
        "Los reembolsos de pagos con QR de ventas canceladas y de aprobaciones tardías se envían a Mercado Pago desde acá; los demás se hacen fuera del sistema y acá se marcan como hechos. Nada se envía a Mercado Pago sin confirmarlo acá.",
      ),
    )
    .toBeVisible();
});

test("filters the loaded refunds by the register that took them, offering every register in the list", async () => {
  const services = createServices();
  const onFiltersChange = vi.fn();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: pendingRefundsWithLatePayment,
  });
  const screen = await renderScreen(services, () => {}, { onFiltersChange });
  await expect.element(screen.getByText("$ 1.250,00", { exact: true })).toBeVisible();

  await screen.getByRole("button", { name: /Caja/ }).click();
  const options = screen
    .getByRole("option")
    .all()
    .map((option) => option.element().textContent?.trim());
  expect(options).toEqual(["Todas", "Caja del frente", "Caja principal"]);
  await userEvent.click(screen.getByRole("option", { name: "Caja del frente" }));

  await expect.poll(() => screen.getByText("$ 2.500,00", { exact: true }).query()).toBeNull();
  await expect.element(screen.getByText("$ 1.250,00", { exact: true })).toBeVisible();
  expect(services.fetchPendingRefunds).toHaveBeenCalledTimes(1);
  expect(onFiltersChange).toHaveBeenLastCalledWith({
    register: "33333333-3333-4333-8333-333333333333",
  });
});

test("opens on the register the address carries", async () => {
  const services = createServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: pendingRefundsWithLatePayment,
  });

  const screen = await renderScreen(services, () => {}, {
    filters: { register: "33333333-3333-4333-8333-333333333333" },
  });

  await expect.element(screen.getByText("$ 1.250,00", { exact: true })).toBeVisible();
  expect(screen.getByText("$ 2.500,00", { exact: true }).query()).toBeNull();
  await expect.element(screen.getByRole("button", { name: /Caja del frente/ })).toBeVisible();
});

test("shows every refund and reports every register when the address carries a register the list has none for", async () => {
  const services = createServices();
  const onFiltersChange = vi.fn();
  const { promise, resolve } = deferred<Awaited<ReturnType<typeof services.fetchPendingRefunds>>>();
  vi.mocked(services.fetchPendingRefunds).mockReturnValue(promise);

  const screen = await renderScreen(services, () => {}, {
    filters: { register: "99999999-0000-4000-8000-000000000000" },
    onFiltersChange,
  });
  expect(onFiltersChange).not.toHaveBeenCalled();
  resolve({ kind: "ok", value: pendingRefunds });

  await expect.element(screen.getByText("$ 2.500,00", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("$ 980,00", { exact: true })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: /Caja.*Todas/ })).toBeVisible();
  await expect.poll(() => onFiltersChange.mock.lastCall).toEqual([{ register: "all" }]);
});

test("shows the empty state when no refund is pending", async () => {
  const services = createServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: noPendingRefunds,
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Sin reembolsos pendientes")).toBeVisible();
  await expect
    .element(screen.getByText("Todos los reembolsos hechos fuera del sistema están marcados."))
    .toBeVisible();
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
  await expect.element(screen.getByText("$ 2.500,00", { exact: true })).toBeVisible();
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
  await expect.poll(() => screen.getByText("$ 2.500,00", { exact: true }).query()).toBeNull();
  await expect.element(screen.getByText("$ 980,00", { exact: true })).toBeVisible();
});

test("marking a refund as done reads the pending refunds again and leaves other concepts' data as it was", async () => {
  const services = createServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({ kind: "ok", value: pendingRefunds });
  vi.mocked(services.markRefundDone).mockResolvedValue({ kind: "ok" });
  const queryClient = createQueryClient();
  const salesReportKey = ["sales", "report"];
  queryClient.setQueryData(salesReportKey, []);
  const screen = await render(
    <QueryClientProvider client={queryClient}>
      <FieldSizeProvider size="backoffice">
        <main>
          <PendingRefundsScreen
            services={services}
            onSessionEnded={() => {}}
            filters={pendingRefundsFilters.parse({})}
            onFiltersChange={() => {}}
          />
        </main>
      </FieldSizeProvider>
    </QueryClientProvider>,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Marcar como hecho el reembolso de $ 2.500,00" }),
  );

  await userEvent.click(
    screen.getByRole("dialog").getByRole("button", { name: "Marcar como hecho" }),
  );

  await expect.poll(() => services.fetchPendingRefunds).toHaveBeenCalledTimes(2);
  expect(queryClient.getQueryState(salesReportKey)?.isInvalidated).toBe(false);
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
  await expect.poll(() => screen.getByText("$ 2.500,00", { exact: true }).query()).toBeNull();
});

test("cancel closes the question and the refund stays listed", async () => {
  const services = createServices();
  const screen = await loaded(services);
  await userEvent.click(
    screen.getByRole("button", { name: "Marcar como hecho el reembolso de $ 2.500,00" }),
  );

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("$ 2.500,00", { exact: true })).toBeVisible();
  expect(services.markRefundDone).not.toHaveBeenCalled();
});

async function loadedWithLatePayment(services: PendingRefundsScreenServices) {
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: pendingRefundsWithLatePayment,
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("$ 1.250,00", { exact: true })).toBeVisible();
  return screen;
}

test("offers to discard only the refunds the cloud says are discardable", async () => {
  const services = createServices();
  const screen = await loadedWithLatePayment(services);

  await expect
    .element(screen.getByRole("button", { name: "Descartar el reembolso de $ 1.250,00" }))
    .toBeVisible();
  expect(
    screen.getByRole("button", { name: "Descartar el reembolso de $ 2.500,00" }).query(),
  ).toBeNull();
  await expect
    .element(screen.getByRole("button", { name: "Marcar como hecho el reembolso de $ 2.500,00" }))
    .toBeVisible();
  await expect
    .element(
      screen.getByRole("button", { name: "Enviar a Mercado Pago el reembolso de $ 1.250,00" }),
    )
    .toBeVisible();
  expect(
    screen.getByRole("button", { name: "Marcar como hecho el reembolso de $ 1.250,00" }).query(),
  ).toBeNull();
});

test("offers a late QR payment's refund to send and to discard, never to mark done, while nobody confirmed it", async () => {
  const services = createServices();
  const screen = await loadedWithLatePayment(services);

  await expect
    .element(
      screen.getByRole("button", { name: "Enviar a Mercado Pago el reembolso de $ 1.250,00" }),
    )
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Descartar el reembolso de $ 1.250,00" }))
    .toBeVisible();
  expect(
    screen.getByRole("button", { name: "Marcar como hecho el reembolso de $ 1.250,00" }).query(),
  ).toBeNull();
  await expect.element(screen.getByText("Sin confirmar")).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("offers neither sending nor discarding a late QR payment's refund once it was confirmed, and tells how far it got", async () => {
  const services = createServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: pendingRefundsWithConfirmedLatePayment,
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("$ 1.250,00", { exact: true })).toBeVisible();

  expect(screen.getByRole("button", { name: /1\.250,00/ }).all()).toHaveLength(0);
  await expect.element(screen.getByText("Enviado a Mercado Pago · en proceso")).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the manual mark as done, and the discard, for a late POINT payment's refund", async () => {
  const services = createServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: pendingRefundsWithLatePointPayment,
  });
  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("button", { name: "Marcar como hecho el reembolso de $ 760,00" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Descartar el reembolso de $ 760,00" }))
    .toBeVisible();
  expect(
    screen.getByRole("button", { name: "Enviar a Mercado Pago el reembolso de $ 760,00" }).query(),
  ).toBeNull();
});

test("discarding a refund asks first, then discards it and the refund leaves the list", async () => {
  const services = createServices();
  vi.mocked(services.discardRefund).mockResolvedValue({ kind: "ok" });
  const screen = await loadedWithLatePayment(services);

  await userEvent.click(
    screen.getByRole("button", { name: "Descartar el reembolso de $ 1.250,00" }),
  );
  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("heading", { name: "¿Descartar el reembolso de $ 1.250,00?" }))
    .toBeVisible();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({ kind: "ok", value: pendingRefunds });
  await userEvent.click(dialog.getByRole("button", { name: "Descartar reembolso" }));

  expect(services.discardRefund).toHaveBeenCalledWith(LATE_PAYMENT_REFUND_ID);
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => screen.getByText("$ 1.250,00", { exact: true }).query()).toBeNull();
  await expect.element(screen.getByText("$ 2.500,00", { exact: true })).toBeVisible();
});

test("a refund another person already discarded leaves the list once the list is updated", async () => {
  const services = createServices();
  vi.mocked(services.discardRefund).mockResolvedValue({ kind: "already_discarded" });
  const screen = await loadedWithLatePayment(services);
  await userEvent.click(
    screen.getByRole("button", { name: "Descartar el reembolso de $ 1.250,00" }),
  );
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Descartar reembolso" }));
  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Ya estaba descartado");
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({ kind: "ok", value: pendingRefunds });

  await userEvent.click(dialog.getByRole("button", { name: "Actualizar la lista" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => screen.getByText("$ 1.250,00", { exact: true }).query()).toBeNull();
});

test("cancel closes the discard question and the refund stays listed", async () => {
  const services = createServices();
  const screen = await loadedWithLatePayment(services);
  await userEvent.click(
    screen.getByRole("button", { name: "Descartar el reembolso de $ 1.250,00" }),
  );

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("$ 1.250,00", { exact: true })).toBeVisible();
  expect(services.discardRefund).not.toHaveBeenCalled();
});

test("offers sending a QR refund of a cancelled sale to Mercado Pago and never marking it done", async () => {
  const services = createServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: pendingRefundsWithUnconfirmedCloudRefund,
  });
  const screen = await renderScreen(services);

  await expect
    .element(
      screen.getByRole("button", {
        name: "Enviar a Mercado Pago el reembolso de $ 3.400,00",
      }),
    )
    .toBeVisible();
  expect(
    screen.getByRole("button", { name: "Marcar como hecho el reembolso de $ 3.400,00" }).query(),
  ).toBeNull();
  await expect
    .element(screen.getByRole("button", { name: "Marcar como hecho el reembolso de $ 2.500,00" }))
    .toBeVisible();
  expect(
    screen
      .getByRole("button", { name: "Enviar a Mercado Pago el reembolso de $ 2.500,00" })
      .query(),
  ).toBeNull();
  await expectNoAccessibilityViolations(screen.container);
});

test("tells how far each QR refund the cloud sends got and offers sending only the unconfirmed one", async () => {
  const services = createServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: pendingRefundsOfEveryCloudRefundStage,
  });
  const screen = await renderScreen(services);
  await expect.poll(() => screen.getByRole("row").all().length).toBe(6);

  const rows = screen
    .getByRole("row")
    .all()
    .slice(1)
    .map((row) => row.element().textContent ?? "");
  expect(rows[2]).toContain("Enviado a Mercado Pago · en proceso");
  expect(screen.getByRole("button", { name: /^Enviar a Mercado Pago/ }).all()).toHaveLength(1);
  expect(screen.getByRole("button", { name: /^Marcar como hecho/ }).all()).toHaveLength(0);
  await expectNoAccessibilityViolations(screen.container);
});

test("sending a refund asks first, then sends it, refreshes the list and tells Mercado Pago's answer", async () => {
  const services = createServices();
  vi.mocked(services.fetchPendingRefunds)
    .mockResolvedValueOnce({ kind: "ok", value: pendingRefundsWithUnconfirmedCloudRefund })
    .mockResolvedValue({ kind: "ok", value: pendingRefunds });
  vi.mocked(services.confirmRefund).mockResolvedValue({
    kind: "ok",
    value: { refund_id: CLOUD_SENT_REFUND_ID, outcome: "sent" },
  });
  const screen = await renderScreen(services);
  await userEvent.click(
    screen.getByRole("button", { name: "Enviar a Mercado Pago el reembolso de $ 3.400,00" }),
  );

  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("heading", { name: "¿Enviar el reembolso a Mercado Pago?" }))
    .toBeVisible();
  expect(services.confirmRefund).not.toHaveBeenCalled();
  await userEvent.click(dialog.getByRole("button", { name: "Enviar a Mercado Pago" }));

  expect(services.confirmRefund).toHaveBeenCalledWith(CLOUD_SENT_REFUND_ID);
  await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
  await expect.element(screen.getByText("Reembolso enviado a Mercado Pago")).toBeVisible();
  await expect.poll(() => vi.mocked(services.fetchPendingRefunds).mock.calls.length).toBe(2);
});

test("a refusal of the confirmation keeps the question open and refreshes nothing until the list is updated", async () => {
  const services = createServices();
  vi.mocked(services.fetchPendingRefunds)
    .mockResolvedValueOnce({ kind: "ok", value: pendingRefundsWithUnconfirmedCloudRefund })
    .mockResolvedValue({ kind: "ok", value: pendingRefunds });
  vi.mocked(services.confirmRefund).mockResolvedValue({ kind: "already_confirmed" });
  const screen = await renderScreen(services);
  await userEvent.click(
    screen.getByRole("button", { name: "Enviar a Mercado Pago el reembolso de $ 3.400,00" }),
  );
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Enviar a Mercado Pago" }));

  await expect
    .element(dialog.getByRole("alert"))
    .toHaveTextContent("Este reembolso ya estaba confirmado");
  expect(services.fetchPendingRefunds).toHaveBeenCalledTimes(1);
  await userEvent.click(dialog.getByRole("button", { name: "Actualizar la lista" }));

  await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
  await expect.poll(() => vi.mocked(services.fetchPendingRefunds).mock.calls.length).toBe(2);
});
