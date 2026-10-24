import type { ContingencyBackupTicketRescueResponse } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { resetPageState } from "../shell/test-support/app";
import {
  createServices,
  deferred,
  renderScreen,
  rescuedEarlierSale,
  rescuedSale,
  ticketCodes,
} from "./test-support/contingency-ticket-rescue-screen";

beforeEach(resetPageState);

function answering(value: ContingencyBackupTicketRescueResponse) {
  const setup = createServices();
  vi.mocked(setup.services.rescueContingencyBackupTicket).mockResolvedValue({
    kind: "ok",
    value,
  });
  return setup;
}

test("shows the breadcrumb, the heading and the scanner", async () => {
  const { services } = createServices();

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Configuración")).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Rescate de tickets", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByText("Mostrar el QR del ticket a la cámara")).toBeVisible();
});

test("shows an empty table before any ticket was read", async () => {
  const { services } = createServices();

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("table", { name: "Tickets leídos" })).toBeVisible();
  await expect.element(screen.getByText("Todavía no se leyó ningún ticket")).toBeVisible();
  await expect.element(screen.getByRole("columnheader", { name: "Ticket" })).toBeVisible();
  await expect.element(screen.getByRole("columnheader", { name: "Caja" })).toBeVisible();
  await expect.element(screen.getByRole("columnheader", { name: "Total" })).toBeVisible();
  await expect.element(screen.getByRole("columnheader", { name: "Resultado" })).toBeVisible();
});

test("sends the code of a one-code ticket and shows it as recovered", async () => {
  const [code = ""] = ticketCodes(1);
  const { services, scanner } = answering(rescuedSale);
  const screen = await renderScreen(services);

  scanner.show(code);

  await expect.element(screen.getByText("Venta del 14/09/2026 17:22")).toBeVisible();
  await expect.element(screen.getByText("Factura C 00004-00000301 · CAEA")).toBeVisible();
  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  await expect.element(screen.getByText("$ 8.940,00")).toBeVisible();
  await expect.element(screen.getByText("Verificado y recuperado")).toBeVisible();
  expect(services.rescueContingencyBackupTicket).toHaveBeenCalledWith([code]);
  expect(screen.getByText("Todavía no se leyó ningún ticket").query()).toBeNull();
});

test("shows the ticket as being verified until the cloud answers", async () => {
  const [code = ""] = ticketCodes(1);
  const { services, scanner } = createServices();
  const answer = deferred<Awaited<ReturnType<typeof services.rescueContingencyBackupTicket>>>();
  vi.mocked(services.rescueContingencyBackupTicket).mockReturnValue(answer.promise);
  const screen = await renderScreen(services);

  scanner.show(code);

  await expect.element(screen.getByText("Verificando")).toBeVisible();
  answer.resolve({ kind: "ok", value: rescuedSale });
  await expect.element(screen.getByText("Verificado y recuperado")).toBeVisible();
  expect(screen.getByText("Verificando").query()).toBeNull();
});

test("says a ticket was already recovered when the cloud received nothing new", async () => {
  const [code = ""] = ticketCodes(1);
  const { services, scanner } = answering({ ...rescuedSale, received: 0, already_received: 3 });
  const screen = await renderScreen(services);

  scanner.show(code);

  await expect.element(screen.getByText("Ya estaba recuperado")).toBeVisible();
  expect(screen.getByText("Verificado y recuperado").query()).toBeNull();
  await expect.element(screen.getByText("$ 8.940,00")).toBeVisible();
});

test("shows a dash for the total of a ticket that is not a sale", async () => {
  const [code = ""] = ticketCodes(1);
  const { services, scanner } = answering({
    ...rescuedSale,
    summary: { operation: "cash_session_closing", occurred_at: null, vouchers: [], sale_total: null },
  });
  const screen = await renderScreen(services);

  scanner.show(code);

  await expect.element(screen.getByText("Cierre de caja")).toBeVisible();
  await expect.element(screen.getByText("—")).toBeVisible();
});

test.each([
  ["unreadable", "QR ilegible o de otro sistema"],
  ["incomplete", "Faltan QR de este ticket"],
  ["unknown_key", "Clave de cifrado desconocida"],
  ["not_authentic", "El ticket no es auténtico"],
  ["foreign_installation", "Ticket de otra instalación"],
  ["conflicting", "Los QR no son del mismo ticket"],
] as const)("says nothing was recovered when the cloud answers %s", async (outcome, title) => {
  const [code = ""] = ticketCodes(1);
  const { services, scanner } = answering({ outcome });
  const screen = await renderScreen(services);

  scanner.show(code);

  await expect.element(screen.getByText(title)).toBeVisible();
  await expect.element(screen.getByText("No se pudo verificar")).toBeVisible();
  await expect.element(screen.getByText("No se recuperó nada")).toBeVisible();
});

test("says the ticket could not be sent when the request fails", async () => {
  const [code = ""] = ticketCodes(1);
  const { services, scanner } = createServices();
  vi.mocked(services.rescueContingencyBackupTicket).mockResolvedValue({ kind: "failed" });
  const screen = await renderScreen(services);

  scanner.show(code);

  await expect.element(screen.getByText("No se pudo enviar el ticket")).toBeVisible();
  await expect.element(screen.getByText("No se pudo verificar")).toBeVisible();
  await expect.element(screen.getByText("Mostralo de nuevo")).toBeVisible();
});

test("treats a rate limit as a failed request", async () => {
  const [code = ""] = ticketCodes(1);
  const { services, scanner } = createServices();
  vi.mocked(services.rescueContingencyBackupTicket).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 30,
  });
  const screen = await renderScreen(services);

  scanner.show(code);

  await expect.element(screen.getByText("No se pudo enviar el ticket")).toBeVisible();
});

test("ends the session when the cloud says there is none", async () => {
  const [code = ""] = ticketCodes(1);
  const { services, scanner } = createServices();
  vi.mocked(services.rescueContingencyBackupTicket).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  await renderScreen(services, onSessionEnded);

  scanner.show(code);

  await vi.waitFor(() => expect(onSessionEnded).toHaveBeenCalled());
});

test("sends the person to Mi cuenta when the cloud refuses the permission", async () => {
  const [code = ""] = ticketCodes(1);
  const { services, scanner } = createServices();
  vi.mocked(services.rescueContingencyBackupTicket).mockResolvedValue({ kind: "forbidden" });
  await renderScreen(services);

  scanner.show(code);

  await vi.waitFor(() => expect(window.location.pathname).toBe("/account"));
});

test("shows a text that is not a code of this system as unreadable without asking the cloud", async () => {
  const { services, scanner } = createServices();
  const screen = await renderScreen(services);

  scanner.show("https://example.com");

  await expect.element(screen.getByText("QR ilegible o de otro sistema")).toBeVisible();
  await expect.element(screen.getByText("No se pudo verificar")).toBeVisible();
  await expect.element(screen.getByText("No se recuperó nada")).toBeVisible();
  expect(services.rescueContingencyBackupTicket).not.toHaveBeenCalled();
});

test("waits for every code of a ticket and sends them together", async () => {
  const [first = "", second = ""] = ticketCodes(2);
  const { services, scanner } = answering(rescuedSale);
  const screen = await renderScreen(services);

  scanner.show(first);

  await expect.element(screen.getByText("QR 1 de 2 leído")).toBeVisible();
  expect(services.rescueContingencyBackupTicket).not.toHaveBeenCalled();
  expect(screen.getByText("Todavía no se leyó ningún ticket").query()).toBeNull();
  expect(screen.getByText("Verificando").query()).toBeNull();

  scanner.show(second);

  await expect.element(screen.getByText("Verificado y recuperado")).toBeVisible();
  expect(services.rescueContingencyBackupTicket).toHaveBeenCalledTimes(1);
  expect(services.rescueContingencyBackupTicket).toHaveBeenCalledWith([first, second]);
  expect(screen.getByText(/leído/).query()).toBeNull();
});

test("ignores a code of a ticket in progress that was already read", async () => {
  const [first = ""] = ticketCodes(2);
  const { services, scanner } = answering(rescuedSale);
  const screen = await renderScreen(services);
  scanner.show(first);
  await expect.element(screen.getByText("QR 1 de 2 leído")).toBeVisible();

  scanner.show(first);

  await expect.element(screen.getByText("QR 1 de 2 leído")).toBeVisible();
  expect(services.rescueContingencyBackupTicket).not.toHaveBeenCalled();
});

test("ignores the same ticket shown again while its request is in flight", async () => {
  const [code = ""] = ticketCodes(1);
  const { services, scanner } = createServices();
  const answer = deferred<Awaited<ReturnType<typeof services.rescueContingencyBackupTicket>>>();
  vi.mocked(services.rescueContingencyBackupTicket).mockReturnValue(answer.promise);
  const screen = await renderScreen(services);
  scanner.show(code);
  await expect.element(screen.getByText("Verificando")).toBeVisible();

  scanner.show(code);
  answer.resolve({ kind: "ok", value: rescuedSale });

  await expect.element(screen.getByText("Verificado y recuperado")).toBeVisible();
  expect(services.rescueContingencyBackupTicket).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("row").all()).toHaveLength(2);
});

test("lists the newest ticket first", async () => {
  const [oneCode = ""] = ticketCodes(1, 1);
  const [otherCode = ""] = ticketCodes(1, 2);
  const { services, scanner } = createServices();
  vi.mocked(services.rescueContingencyBackupTicket)
    .mockResolvedValueOnce({ kind: "ok", value: rescuedEarlierSale })
    .mockResolvedValueOnce({ kind: "ok", value: rescuedSale });
  const screen = await renderScreen(services);

  scanner.show(oneCode);
  await expect.element(screen.getByText("Venta del 14/09/2026 17:05")).toBeVisible();
  scanner.show(otherCode);
  await expect.element(screen.getByText("Venta del 14/09/2026 17:22")).toBeVisible();

  const rows = screen.getByRole("row").all();
  expect(rows[1]?.element().textContent).toContain("17:22");
  expect(rows[2]?.element().textContent).toContain("17:05");
});

test("shows the camera blocked when the person refused it, with the table still there", async () => {
  const { services, scanner } = createServices();
  const screen = await renderScreen(services);

  scanner.fail("denied");

  await expect.element(screen.getByText("La cámara está bloqueada")).toBeVisible();
  await expect.element(screen.getByRole("table", { name: "Tickets leídos" })).toBeVisible();
});

test("has no accessibility violations empty, with rows and with the camera unavailable", async () => {
  const [code = ""] = ticketCodes(1);
  const { services, scanner } = answering(rescuedSale);
  const screen = await renderScreen(services);
  await expectNoAccessibilityViolations(document.body);

  scanner.show(code);
  await expect.element(screen.getByText("Verificado y recuperado")).toBeVisible();
  await expectNoAccessibilityViolations(document.body);

  scanner.fail("no_camera");
  await expect.element(screen.getByText("No hay una cámara disponible")).toBeVisible();
  await expectNoAccessibilityViolations(document.body);
});
