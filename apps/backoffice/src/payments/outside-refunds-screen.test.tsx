import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { createQueryClient } from "../platform/query-client";
import { render } from "../shell/test-support/render-with-router";
import { OutsideRefundsScreen } from "./outside-refunds-screen";
import type { OutsideRefundsScreenServices } from "./outside-refunds-services";
import { type OutsideRefundsFilters, outsideRefundsFilters } from "./routes";
import { deferred } from "./test-support/deferred";
import { createOutsideRefundsServices } from "./test-support/outside-refunds-screen-services";
import {
  LATE_POINT_PAYMENT_REFUND_ID,
  noPendingRefunds,
  pendingRefunds,
  pendingRefundsOfEveryCloudRefundStage,
  pendingRefundsWithLatePayment,
  pendingRefundsWithLatePointPayment,
  SECOND_REFUND_ID,
  TRANSFER_REFUND_ID,
  transferRefund,
} from "./test-support/refund-fixtures";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

const FRONT_REGISTER_ID = "33333333-3333-4333-8333-333333333333";
const MAIN_REGISTER_ID = "11111111-1111-4111-8111-111111111111";

function renderScreen(
  services: OutsideRefundsScreenServices,
  onSessionEnded = () => {},
  {
    filters = outsideRefundsFilters.parse({}),
    onFiltersChange = () => {},
  }: {
    filters?: OutsideRefundsFilters;
    onFiltersChange?: (filters: OutsideRefundsFilters) => void;
  } = {},
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <OutsideRefundsScreen
          services={services}
          onSessionEnded={onSessionEnded}
          filters={filters}
          onFiltersChange={onFiltersChange}
        />
      </main>
    </FieldSizeProvider>,
  );
}

async function loaded(services: OutsideRefundsScreenServices) {
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({ kind: "ok", value: pendingRefunds });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("table", { name: "Reembolsos sin API" })).toBeVisible();
  return screen;
}

async function loadedWithPoint(
  services: OutsideRefundsScreenServices,
  options?: Parameters<typeof renderScreen>[2],
) {
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: pendingRefundsWithLatePointPayment,
  });
  const screen = await renderScreen(services, () => {}, options);
  await expect.element(screen.getByRole("table", { name: "Reembolsos sin API" })).toBeVisible();
  return screen;
}

function rowTexts(screen: Awaited<ReturnType<typeof renderScreen>>) {
  return screen
    .getByRole("row")
    .all()
    .slice(1)
    .map((row) => row.element().textContent ?? "");
}

test("shows the eyebrow, the heading and each refund made outside the system with since when, why, how, how much", async () => {
  const services = createOutsideRefundsServices();
  const screen = await loaded(services);

  await expect.element(screen.getByText("Caja y fiscal · Tareas")).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Reembolsos sin API", level: 1 }))
    .toBeVisible();
  await expect.poll(() => rowTexts(screen).length).toBe(2);
  const rows = rowTexts(screen);
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
  const services = createOutsideRefundsServices();
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

test("lists only the refunds made outside the system, leaving out the ones Mercado Pago sends", async () => {
  const services = createOutsideRefundsServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: pendingRefundsWithLatePayment,
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("$ 2.500,00", { exact: true })).toBeVisible();
  expect(screen.getByText("$ 1.250,00", { exact: true }).query()).toBeNull();
  expect(rowTexts(screen)).toHaveLength(1);
});

test("tells a Point refund made outside the system by its method alone", async () => {
  const services = createOutsideRefundsServices();
  const screen = await loadedWithPoint(services);

  await expect.element(screen.getByText("$ 760,00", { exact: true })).toBeVisible();
  const pointRow = rowTexts(screen).find((row) => row.includes("$ 760,00"));
  expect(pointRow).toContain("Point integrada");
  expect(pointRow).not.toContain("Sin confirmar");
});

test("names the Mercado Pago order under the method of a refund made outside the system that carries one", async () => {
  const services = createOutsideRefundsServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: {
      refunds: [
        {
          ...transferRefund,
          method: "POINT",
          origin: "late_payment",
          provider_order_id: "ORD01JQ4S4KY8HWQ6NA5PXB65B3D3",
        },
      ],
    },
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("$ 2.500,00", { exact: true })).toBeVisible();
  const [row] = rowTexts(screen);
  expect(row).toContain("Point integrada");
  expect(row).toContain("Orden ORD01JQ4S4KY8HWQ6NA5PXB65B3D3");
});

test("explains under the table that these refunds are made outside the system and marked as done here", async () => {
  const services = createOutsideRefundsServices();
  const screen = await loaded(services);

  await expect
    .element(screen.getByText("Se hacen fuera del sistema y acá se marcan como hechos."))
    .toBeVisible();
});

test("filters the loaded refunds by the register that took them, offering every register in the list", async () => {
  const services = createOutsideRefundsServices();
  const onFiltersChange = vi.fn();
  const screen = await loadedWithPoint(services, { onFiltersChange });
  await expect.element(screen.getByText("$ 760,00", { exact: true })).toBeVisible();

  await screen.getByRole("button", { name: /Caja/ }).click();
  const options = screen
    .getByRole("option")
    .all()
    .map((option) => option.element().textContent?.trim());
  expect(options).toEqual(["Todas", "Caja del frente", "Caja principal"]);
  await userEvent.click(screen.getByRole("option", { name: "Caja del frente" }));

  await expect.poll(() => screen.getByText("$ 2.500,00", { exact: true }).query()).toBeNull();
  await expect.element(screen.getByText("$ 760,00", { exact: true })).toBeVisible();
  expect(services.fetchPendingRefunds).toHaveBeenCalledTimes(1);
  expect(onFiltersChange).toHaveBeenLastCalledWith({ register: FRONT_REGISTER_ID, method: "all" });
});

test("opens on the register the address carries", async () => {
  const services = createOutsideRefundsServices();
  const screen = await loadedWithPoint(services, {
    filters: { register: FRONT_REGISTER_ID, method: "all" },
  });

  await expect.element(screen.getByText("$ 760,00", { exact: true })).toBeVisible();
  expect(screen.getByText("$ 2.500,00", { exact: true }).query()).toBeNull();
  await expect.element(screen.getByRole("button", { name: /Caja del frente/ })).toBeVisible();
});

test("shows every refund and reports every register when the address carries a register the list has none for", async () => {
  const services = createOutsideRefundsServices();
  const onFiltersChange = vi.fn();
  const { promise, resolve } = deferred<Awaited<ReturnType<typeof services.fetchPendingRefunds>>>();
  vi.mocked(services.fetchPendingRefunds).mockReturnValue(promise);

  const screen = await renderScreen(services, () => {}, {
    filters: { register: "99999999-0000-4000-8000-000000000000", method: "all" },
    onFiltersChange,
  });
  expect(onFiltersChange).not.toHaveBeenCalled();
  resolve({ kind: "ok", value: pendingRefunds });

  await expect.element(screen.getByText("$ 2.500,00", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("$ 980,00", { exact: true })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: /Caja.*Todas/ })).toBeVisible();
  await expect
    .poll(() => onFiltersChange.mock.lastCall)
    .toEqual([{ register: "all", method: "all" }]);
});

test("offers only the registers of the refunds made outside the system", async () => {
  const services = createOutsideRefundsServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: pendingRefundsWithLatePayment,
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("$ 2.500,00", { exact: true })).toBeVisible();

  await screen.getByRole("button", { name: /Caja/ }).click();

  const options = screen
    .getByRole("option")
    .all()
    .map((option) => option.element().textContent?.trim());
  expect(options).toEqual(["Todas", "Caja principal"]);
});

test("filters the loaded refunds by method, offering every method present in the list sorted by name", async () => {
  const services = createOutsideRefundsServices();
  const onFiltersChange = vi.fn();
  const screen = await loadedWithPoint(services, { onFiltersChange });
  await expect.element(screen.getByText("$ 760,00", { exact: true })).toBeVisible();

  await screen.getByRole("button", { name: /Medio/ }).click();
  const options = screen
    .getByRole("option")
    .all()
    .map((option) => option.element().textContent?.trim());
  expect(options).toEqual(["Todos", "Point integrada", "Transferencia"]);
  await userEvent.click(screen.getByRole("option", { name: "Point integrada" }));

  await expect.poll(() => screen.getByText("$ 2.500,00", { exact: true }).query()).toBeNull();
  await expect.element(screen.getByText("$ 760,00", { exact: true })).toBeVisible();
  expect(onFiltersChange).toHaveBeenLastCalledWith({ register: "all", method: "POINT" });
});

test("offers only the methods of the refunds made outside the system", async () => {
  const services = createOutsideRefundsServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: pendingRefundsWithLatePayment,
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("$ 2.500,00", { exact: true })).toBeVisible();

  await screen.getByRole("button", { name: /Medio/ }).click();

  const options = screen
    .getByRole("option")
    .all()
    .map((option) => option.element().textContent?.trim());
  expect(options).toEqual(["Todos", "Transferencia"]);
});

test("combines the register and the method filters", async () => {
  const services = createOutsideRefundsServices();
  const screen = await loadedWithPoint(services, {
    filters: { register: FRONT_REGISTER_ID, method: "POINT" },
  });

  await expect.element(screen.getByText("$ 760,00", { exact: true })).toBeVisible();
  expect(screen.getByText("$ 2.500,00", { exact: true }).query()).toBeNull();
});

test("opens on the method the address carries", async () => {
  const services = createOutsideRefundsServices();
  const screen = await loadedWithPoint(services, {
    filters: { register: "all", method: "TRANSFER" },
  });

  await expect.element(screen.getByText("$ 2.500,00", { exact: true })).toBeVisible();
  expect(screen.getByText("$ 760,00", { exact: true }).query()).toBeNull();
  await expect.element(screen.getByRole("button", { name: /Medio.*Transferencia/ })).toBeVisible();
});

test("shows every refund and reports every method when the address carries a method the list has none for", async () => {
  const services = createOutsideRefundsServices();
  const onFiltersChange = vi.fn();
  const { promise, resolve } = deferred<Awaited<ReturnType<typeof services.fetchPendingRefunds>>>();
  vi.mocked(services.fetchPendingRefunds).mockReturnValue(promise);

  const screen = await renderScreen(services, () => {}, {
    filters: { register: "all", method: "CASH" },
    onFiltersChange,
  });
  expect(onFiltersChange).not.toHaveBeenCalled();
  resolve({ kind: "ok", value: pendingRefundsWithLatePointPayment });

  await expect.element(screen.getByText("$ 2.500,00", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("$ 760,00", { exact: true })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: /Medio.*Todos/ })).toBeVisible();
  await expect
    .poll(() => onFiltersChange.mock.lastCall)
    .toEqual([{ register: "all", method: "all" }]);
});

test("says no refund matches the filters when the register and the method chosen together hide every refund", async () => {
  const services = createOutsideRefundsServices();
  const screen = await loadedWithPoint(services, {
    filters: { register: MAIN_REGISTER_ID, method: "POINT" },
  });

  await expect
    .element(screen.getByText("No hay reembolsos pendientes con estos filtros"))
    .toBeVisible();
  await expect.element(screen.getByText("Probá con otra caja o con otro medio.")).toBeVisible();
  expect(screen.getByText("Sin reembolsos pendientes", { exact: true }).query()).toBeNull();
});

test("shows the empty state when every pending refund is one Mercado Pago sends", async () => {
  const services = createOutsideRefundsServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: pendingRefundsOfEveryCloudRefundStage,
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Sin reembolsos pendientes")).toBeVisible();
  await expect
    .element(screen.getByText("Todos los reembolsos hechos fuera del sistema están marcados."))
    .toBeVisible();
});

test("shows the empty state when no refund is pending at all", async () => {
  const services = createOutsideRefundsServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: noPendingRefunds,
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Sin reembolsos pendientes")).toBeVisible();
});

test("shows the table loading while the refunds load", async () => {
  const services = createOutsideRefundsServices();
  const firstLoad = deferred<Awaited<ReturnType<typeof services.fetchPendingRefunds>>>();
  vi.mocked(services.fetchPendingRefunds).mockReturnValueOnce(firstLoad.promise);

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("table", { name: "Reembolsos sin API" }))
    .toHaveAttribute("aria-busy", "true");
});

test("shows a load error with a retry action that starts again from the loading placeholder", async () => {
  const services = createOutsideRefundsServices();
  const retry = deferred<Awaited<ReturnType<typeof services.fetchPendingRefunds>>>();
  vi.mocked(services.fetchPendingRefunds)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retry.promise);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir los reembolsos sin API")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByRole("table", { name: "Reembolsos sin API" }))
    .toHaveAttribute("aria-busy", "true");
  retry.resolve({ kind: "ok", value: pendingRefunds });
  await expect.element(screen.getByText("$ 2.500,00", { exact: true })).toBeVisible();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const services = createOutsideRefundsServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("navigates to Mi cuenta when the refunds request comes back forbidden", async () => {
  window.history.pushState(null, "", "/refunds/outside-the-system");
  const services = createOutsideRefundsServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("ends the session when the refunds request finds no open session", async () => {
  const services = createOutsideRefundsServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("offers marking as done on every refund, and discarding only the ones the cloud says are discardable, never sending", async () => {
  const services = createOutsideRefundsServices();
  const screen = await loadedWithPoint(services);

  await expect
    .element(screen.getByRole("button", { name: "Marcar como hecho el reembolso de $ 2.500,00" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Marcar como hecho el reembolso de $ 760,00" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Descartar el reembolso de $ 760,00" }))
    .toBeVisible();
  expect(
    screen.getByRole("button", { name: "Descartar el reembolso de $ 2.500,00" }).query(),
  ).toBeNull();
  expect(screen.getByRole("button", { name: /^Enviar a Mercado Pago/ }).all()).toHaveLength(0);
  await expectNoAccessibilityViolations(screen.container);
});

test("discarding a refund asks first, then discards it, reads the refunds again and the refund leaves the list", async () => {
  const services = createOutsideRefundsServices();
  vi.mocked(services.discardRefund).mockResolvedValue({ kind: "ok" });
  const screen = await loadedWithPoint(services);

  await userEvent.click(screen.getByRole("button", { name: "Descartar el reembolso de $ 760,00" }));
  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("heading", { name: "¿Descartar el reembolso de $ 760,00?" }))
    .toBeVisible();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({ kind: "ok", value: pendingRefunds });
  await userEvent.click(dialog.getByRole("button", { name: "Descartar reembolso" }));

  expect(services.discardRefund).toHaveBeenCalledWith(LATE_POINT_PAYMENT_REFUND_ID);
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => screen.getByText("$ 760,00", { exact: true }).query()).toBeNull();
  expect(services.fetchPendingRefunds).toHaveBeenCalledTimes(2);
});

test("cancel closes the discard question and the refund stays listed", async () => {
  const services = createOutsideRefundsServices();
  const screen = await loadedWithPoint(services);
  await userEvent.click(screen.getByRole("button", { name: "Descartar el reembolso de $ 760,00" }));

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("$ 760,00", { exact: true })).toBeVisible();
  expect(services.discardRefund).not.toHaveBeenCalled();
});

test("marking a refund as done asks first, then marks it and the refund leaves the list", async () => {
  const services = createOutsideRefundsServices();
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

test("marking a refund as done reads the refunds again and leaves other concepts' data as it was", async () => {
  const services = createOutsideRefundsServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({ kind: "ok", value: pendingRefunds });
  vi.mocked(services.markRefundDone).mockResolvedValue({ kind: "ok" });
  const queryClient = createQueryClient();
  const salesReportKey = ["sales", "report"];
  queryClient.setQueryData(salesReportKey, []);
  const screen = await render(
    <QueryClientProvider client={queryClient}>
      <FieldSizeProvider size="backoffice">
        <main>
          <OutsideRefundsScreen
            services={services}
            onSessionEnded={() => {}}
            filters={outsideRefundsFilters.parse({})}
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
  const services = createOutsideRefundsServices();
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
  const services = createOutsideRefundsServices();
  const screen = await loaded(services);
  await userEvent.click(
    screen.getByRole("button", { name: "Marcar como hecho el reembolso de $ 2.500,00" }),
  );

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("$ 2.500,00", { exact: true })).toBeVisible();
  expect(services.markRefundDone).not.toHaveBeenCalled();
});
