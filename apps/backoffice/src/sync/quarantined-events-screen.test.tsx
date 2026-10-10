import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { QuarantinedEventsScreen } from "./quarantined-events-screen";
import type { QuarantinedEventsScreenServices } from "./quarantined-events-services";
import { quarantinedCashClosing, quarantinedSale } from "./test-support/quarantined-events";

function createServices(): QuarantinedEventsScreenServices &
  Required<Pick<QuarantinedEventsScreenServices, "releaseQuarantinedEventModal">> {
  return {
    fetchQuarantinedEvents: vi.fn(),
    releaseQuarantinedEventModal: { releaseQuarantinedEvent: vi.fn() },
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function renderScreen(services: QuarantinedEventsScreenServices, onSessionEnded = () => {}) {
  return render(
    <main>
      <QuarantinedEventsScreen services={services} onSessionEnded={onSessionEnded} />
    </main>,
  );
}

test("shows the breadcrumb, the heading and what the list is for", async () => {
  const services = createServices();
  vi.mocked(services.fetchQuarantinedEvents).mockResolvedValue({
    kind: "ok",
    value: { events: [quarantinedSale] },
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Configuración")).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Eventos en cuarentena", level: 1 }))
    .toBeVisible();
  await expect
    .element(
      screen.getByText(
        "Eventos que la nube recibió de las cajas y no pudo aplicar después de agotar los intentos. Cuando su causa esté resuelta, liberá uno: la nube vuelve a intentarlo y, si se aplica, sigue con los eventos del mismo registro que esperaban detrás.",
      ),
    )
    .toBeVisible();
});

test("shows the columns of the list", async () => {
  const services = createServices();
  vi.mocked(services.fetchQuarantinedEvents).mockResolvedValue({
    kind: "ok",
    value: { events: [quarantinedSale] },
  });

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Caja 1")).toBeVisible();

  expect(
    screen
      .getByRole("columnheader")
      .elements()
      .map((header) => header.textContent),
  ).toEqual([
    "Caja",
    "Registro",
    "Evento",
    "Recibido",
    "En cuarentena desde",
    "Último error",
    "Acciones",
  ]);
});

test("shows each quarantined event with its register, event, times and last error", async () => {
  const services = createServices();
  vi.mocked(services.fetchQuarantinedEvents).mockResolvedValue({
    kind: "ok",
    value: { events: [quarantinedSale, quarantinedCashClosing] },
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  await expect.element(screen.getByText("Venta 0192bbbb…")).toBeVisible();
  await expect.element(screen.getByText("Venta", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("column does not exist")).toBeVisible();
  await expect.element(screen.getByText("Caja 2")).toBeVisible();
  await expect.element(screen.getByText("Sesión de caja 0192cccc…")).toBeVisible();
  await expect.element(screen.getByText("Cierre de caja")).toBeVisible();
  const dateCells = screen.getByRole("cell", { name: /^\d{2}\/\d{2}\/\d{4}/ }).elements();
  expect(dateCells).toHaveLength(4);
});

test("has no accessibility violations", async () => {
  const services = createServices();
  vi.mocked(services.fetchQuarantinedEvents).mockResolvedValue({
    kind: "ok",
    value: { events: [quarantinedSale] },
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Caja 1")).toBeVisible();

  await expectNoAccessibilityViolations(screen.container);
});

test("shows the table loading while the events are on their way", async () => {
  const services = createServices();
  vi.mocked(services.fetchQuarantinedEvents).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("table", { name: "Eventos en cuarentena" }))
    .toHaveAttribute("aria-busy", "true");
});

test("shows an empty state when no event is in quarantine", async () => {
  const services = createServices();
  vi.mocked(services.fetchQuarantinedEvents).mockResolvedValue({
    kind: "ok",
    value: { events: [] },
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No hay eventos en cuarentena")).toBeVisible();
});

test("shows a load error, and Reintentar reads the events again", async () => {
  const services = createServices();
  vi.mocked(services.fetchQuarantinedEvents).mockResolvedValueOnce({ kind: "failed" });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByText("No pudimos cargar los eventos en cuarentena"))
    .toBeVisible();

  vi.mocked(services.fetchQuarantinedEvents).mockResolvedValueOnce({
    kind: "ok",
    value: { events: [quarantinedSale] },
  });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Caja 1")).toBeVisible();
});

test("retrying a failed load starts again from the loading placeholder", async () => {
  const services = createServices();
  const retry = deferred<Awaited<ReturnType<typeof services.fetchQuarantinedEvents>>>();
  vi.mocked(services.fetchQuarantinedEvents)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retry.promise);
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByText("No pudimos cargar los eventos en cuarentena"))
    .toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByText("No pudimos cargar los eventos en cuarentena"))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("table", { name: "Eventos en cuarentena" }))
    .toHaveAttribute("aria-busy", "true");
  retry.resolve({ kind: "ok", value: { events: [quarantinedSale] } });
  await expect.element(screen.getByText("Caja 1")).toBeVisible();
});

test("ends the session when the list finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.fetchQuarantinedEvents).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

async function openRelease(screen: Awaited<ReturnType<typeof renderScreen>>) {
  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: "Liberar el evento de venta de la caja Caja 1" }),
  );
  return screen.getByRole("dialog");
}

test("opens the question about an event from its row action", async () => {
  const services = createServices();
  vi.mocked(services.fetchQuarantinedEvents).mockResolvedValue({
    kind: "ok",
    value: { events: [quarantinedSale, quarantinedCashClosing] },
  });
  const screen = await renderScreen(services);

  const dialog = await openRelease(screen);

  await expect
    .element(dialog.getByRole("heading", { name: "¿Liberar este evento?" }))
    .toBeVisible();
  expect(services.releaseQuarantinedEventModal.releaseQuarantinedEvent).not.toHaveBeenCalled();
});

test("cancelling the question releases nothing and keeps the list", async () => {
  const services = createServices();
  vi.mocked(services.fetchQuarantinedEvents).mockResolvedValue({
    kind: "ok",
    value: { events: [quarantinedSale] },
  });
  const screen = await renderScreen(services);
  const dialog = await openRelease(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
  expect(services.releaseQuarantinedEventModal.releaseQuarantinedEvent).not.toHaveBeenCalled();
  expect(services.fetchQuarantinedEvents).toHaveBeenCalledTimes(1);
});

test("a released event is announced and disappears from the refreshed list", async () => {
  const services = createServices();
  vi.mocked(services.fetchQuarantinedEvents)
    .mockResolvedValueOnce({
      kind: "ok",
      value: { events: [quarantinedSale, quarantinedCashClosing] },
    })
    .mockResolvedValue({ kind: "ok", value: { events: [quarantinedCashClosing] } });
  vi.mocked(services.releaseQuarantinedEventModal.releaseQuarantinedEvent).mockResolvedValue({
    kind: "ok",
  });
  const screen = await renderScreen(services);
  const dialog = await openRelease(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Liberar" }));

  expect(services.releaseQuarantinedEventModal.releaseQuarantinedEvent).toHaveBeenCalledWith(
    quarantinedSale.eventId,
  );
  await expect.element(screen.getByText("Evento liberado")).toBeVisible();
  await expect
    .element(screen.getByText("La nube lo va a volver a intentar en los próximos minutos."))
    .toBeVisible();
  await expect.element(screen.getByText("Caja 1")).not.toBeInTheDocument();
  await expect.element(screen.getByText("Caja 2")).toBeVisible();
  await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
});

test("an event that is no longer in quarantine is announced and the list refreshes", async () => {
  const services = createServices();
  vi.mocked(services.fetchQuarantinedEvents)
    .mockResolvedValueOnce({ kind: "ok", value: { events: [quarantinedSale] } })
    .mockResolvedValue({ kind: "ok", value: { events: [] } });
  vi.mocked(services.releaseQuarantinedEventModal.releaseQuarantinedEvent).mockResolvedValue({
    kind: "not_quarantined",
  });
  const screen = await renderScreen(services);
  const dialog = await openRelease(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Liberar" }));

  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("No se liberó el evento Este evento ya no está en cuarentena.");
  await expect.element(screen.getByText("No hay eventos en cuarentena")).toBeVisible();
  await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
});

test("an event the cloud does not find is announced and the list refreshes", async () => {
  const services = createServices();
  vi.mocked(services.fetchQuarantinedEvents)
    .mockResolvedValueOnce({ kind: "ok", value: { events: [quarantinedSale] } })
    .mockResolvedValue({ kind: "ok", value: { events: [] } });
  vi.mocked(services.releaseQuarantinedEventModal.releaseQuarantinedEvent).mockResolvedValue({
    kind: "not_found",
  });
  const screen = await renderScreen(services);
  const dialog = await openRelease(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Liberar" }));

  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("No se liberó el evento No encontramos este evento.");
  await expect.element(screen.getByText("No hay eventos en cuarentena")).toBeVisible();
});

test("a failed release keeps the question open and the list as it was", async () => {
  const services = createServices();
  vi.mocked(services.fetchQuarantinedEvents).mockResolvedValue({
    kind: "ok",
    value: { events: [quarantinedSale] },
  });
  vi.mocked(services.releaseQuarantinedEventModal.releaseQuarantinedEvent).mockResolvedValue({
    kind: "failed",
  });
  const screen = await renderScreen(services);
  const dialog = await openRelease(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Liberar" }));

  await expect.element(dialog.getByText("No pudimos liberar el evento")).toBeVisible();
  expect(services.fetchQuarantinedEvents).toHaveBeenCalledTimes(1);
});
