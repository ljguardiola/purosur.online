import { FieldSizeProvider } from "@purosur/ui";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { RegisterPaymentModalRequest } from "../platform/register-payment-modals";
import type { RegisterPaymentsReload } from "../platform/register-payments-target";
import { render } from "../shell/test-support/render-with-router";
import {
  RegisterPaymentModals,
  type RegisterPaymentModalsServices,
} from "./register-payment-modals";
import { register2 } from "./test-support/register-payments-targets";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

const MODAL_TITLES = ["Terminal Point integrada", "Asignar QR de Mercado Pago"];

function createServices(): RegisterPaymentModalsServices {
  return {
    assignPointTerminal: vi.fn(),
    assignQrPointOfSale: vi.fn(),
  };
}

function createHandlers() {
  return {
    reload: vi.fn<(id: string) => Promise<RegisterPaymentsReload>>(),
    onClose: vi.fn(),
    onAssigned: vi.fn(),
    onSessionEnded: vi.fn(),
  };
}

async function renderModals(
  request: RegisterPaymentModalRequest | null,
  services: RegisterPaymentModalsServices = createServices(),
) {
  const handlers = createHandlers();
  const screen = await render(
    <FieldSizeProvider size="backoffice">
      <main>
        <RegisterPaymentModals request={request} {...handlers} services={services} />
      </main>
    </FieldSizeProvider>,
  );
  return { screen, handlers, services };
}

test("opens no modal without a request", async () => {
  const { screen } = await renderModals(null);

  expect(screen.getByRole("dialog").query()).toBeNull();
});

test.each([
  { request: { kind: "assignTerminal", register: register2 }, title: "Terminal Point integrada" },
  { request: { kind: "assignQr", register: register2 }, title: "Asignar QR de Mercado Pago" },
] as const)("opens only $title for a $request.kind request", async ({ request, title }) => {
  const { screen } = await renderModals(request);

  await expect.element(screen.getByRole("dialog", { name: title, exact: true })).toBeVisible();
  for (const other of MODAL_TITLES.filter((name) => name !== title)) {
    expect(screen.getByRole("dialog", { name: other, exact: true }).query()).toBeNull();
  }
});

test("reports the Point terminal assigned", async () => {
  const services = createServices();
  vi.mocked(services.assignPointTerminal).mockResolvedValue({ kind: "ok" });
  const { screen, handlers } = await renderModals(
    { kind: "assignTerminal", register: register2 },
    services,
  );

  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Terminal Point integrada" })
      .getByRole("button", { name: "Guardar" }),
  );

  await expect.poll(() => handlers.onAssigned.mock.calls.length).toBe(1);
});

test("reports the QR assigned", async () => {
  const services = createServices();
  vi.mocked(services.assignQrPointOfSale).mockResolvedValue({ kind: "ok" });
  const { screen, handlers } = await renderModals(
    { kind: "assignQr", register: register2 },
    services,
  );

  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Asignar QR de Mercado Pago" })
      .getByRole("button", { name: "Guardar" }),
  );

  await expect.poll(() => handlers.onAssigned.mock.calls.length).toBe(1);
});

test.each([
  { request: { kind: "assignTerminal", register: register2 }, title: "Terminal Point integrada" },
  { request: { kind: "assignQr", register: register2 }, title: "Asignar QR de Mercado Pago" },
] as const)("Cancelar in $title asks to close", async ({ request, title }) => {
  const { screen, handlers } = await renderModals(request);

  await userEvent.click(
    screen.getByRole("dialog", { name: title }).getByRole("button", { name: "Cancelar" }),
  );

  expect(handlers.onClose).toHaveBeenCalledOnce();
});
