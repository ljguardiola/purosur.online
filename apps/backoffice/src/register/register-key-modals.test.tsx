import { FieldSizeProvider } from "@purosur/ui";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { RegisterKeyModalRequest } from "../platform/register-key-modals";
import { render } from "../shell/test-support/render-with-router";
import { RegisterKeyModals, type RegisterKeyModalsServices } from "./register-key-modals";
import {
  createServices,
  enrolledRegister,
  registerWithBitlockerKey,
} from "./test-support/register-key-modals";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

const KEY = "111111-222222-333333-444444-555555-666666-707707-110000";

const MODAL_TITLES = [
  "Cargar clave de recuperación de BitLocker",
  "Clave de recuperación de BitLocker",
];

function createHandlers() {
  return {
    onClose: vi.fn(),
    onKeyLoaded: vi.fn(),
    onOutdated: vi.fn(),
    onSessionEnded: vi.fn(),
  };
}

async function renderModals(
  request: RegisterKeyModalRequest | null,
  services: RegisterKeyModalsServices = createServices(),
) {
  const handlers = createHandlers();
  const screen = await render(
    <FieldSizeProvider size="backoffice">
      <main>
        <RegisterKeyModals request={request} {...handlers} services={services} />
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
  {
    request: { kind: "loadKey", register: enrolledRegister },
    title: "Cargar clave de recuperación de BitLocker",
  },
  {
    request: { kind: "consultKey", register: registerWithBitlockerKey },
    title: "Clave de recuperación de BitLocker",
  },
] as const)("opens only $title for a $request.kind request", async ({ request, title }) => {
  const services = createServices();
  vi.mocked(services.consultBitlockerRecoveryKey).mockReturnValue(new Promise(() => {}));
  const { screen } = await renderModals(request, services);

  await expect.element(screen.getByRole("dialog", { name: title, exact: true })).toBeVisible();
  for (const other of MODAL_TITLES.filter((name) => name !== title)) {
    expect(screen.getByRole("dialog", { name: other, exact: true }).query()).toBeNull();
  }
});

test("reports the BitLocker key loaded and the modal closed", async () => {
  const services = createServices();
  vi.mocked(services.loadBitlockerRecoveryKey).mockResolvedValue({ kind: "ok" });
  const { screen, handlers } = await renderModals(
    { kind: "loadKey", register: enrolledRegister },
    services,
  );
  const dialog = screen.getByRole("dialog", { name: "Cargar clave de recuperación de BitLocker" });

  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Clave de recuperación de BitLocker/ }),
    KEY,
  );
  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Identificador de la clave/ }),
    "1A2B3C4D",
  );
  await userEvent.click(dialog.getByRole("button", { name: "Guardar la clave" }));

  await expect.poll(() => handlers.onKeyLoaded.mock.calls.length).toBe(1);
  expect(handlers.onClose).toHaveBeenCalledOnce();
});

test("reports the list outdated when loading the key finds a register that already has one", async () => {
  const services = createServices();
  vi.mocked(services.loadBitlockerRecoveryKey).mockResolvedValue({ kind: "already_loaded" });
  const { screen, handlers } = await renderModals(
    { kind: "loadKey", register: enrolledRegister },
    services,
  );
  const dialog = screen.getByRole("dialog", { name: "Cargar clave de recuperación de BitLocker" });

  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Clave de recuperación de BitLocker/ }),
    KEY,
  );
  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Identificador de la clave/ }),
    "1A2B3C4D",
  );
  await userEvent.click(dialog.getByRole("button", { name: "Guardar la clave" }));

  await expect.poll(() => handlers.onOutdated.mock.calls.length).toBe(1);
  expect(handlers.onKeyLoaded).not.toHaveBeenCalled();
});

test("reports the list outdated when consulting the key of a register that has none", async () => {
  const services = createServices();
  vi.mocked(services.consultBitlockerRecoveryKey).mockResolvedValue({ kind: "not_loaded" });
  const { handlers } = await renderModals(
    { kind: "consultKey", register: registerWithBitlockerKey },
    services,
  );

  await expect.poll(() => handlers.onOutdated.mock.calls.length).toBe(1);
});

test.each([
  {
    request: { kind: "loadKey", register: enrolledRegister },
    title: "Cargar clave de recuperación de BitLocker",
  },
] as const)("Cancelar in $title asks to close", async ({ request, title }) => {
  const { screen, handlers } = await renderModals(request);

  await userEvent.click(
    screen.getByRole("dialog", { name: title }).getByRole("button", { name: "Cancelar" }),
  );

  expect(handlers.onClose).toHaveBeenCalledOnce();
});
