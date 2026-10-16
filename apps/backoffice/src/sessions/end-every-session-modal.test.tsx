import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { EndEverySessionModal, type EndEverySessionModalServices } from "./end-every-session-modal";

function createServices(
  overrides: Partial<EndEverySessionModalServices> = {},
): EndEverySessionModalServices {
  return { endEverySession: vi.fn(), ...overrides };
}

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

type Handlers = {
  onClose?: () => void;
  onSessionEnded?: () => void;
};

async function renderModal(
  services: EndEverySessionModalServices,
  handlers: Handlers = {},
  open = true,
) {
  const screen = await render(
    <main>
      <EndEverySessionModal
        open={open}
        onClose={handlers.onClose ?? (() => {})}
        onSessionEnded={handlers.onSessionEnded ?? (() => {})}
        services={services}
      />
    </main>,
  );
  return {
    screen,
    dialog: screen.getByRole("dialog", { name: "¿Cerrar todas las sesiones?" }),
  };
}

test("asks whether to close every session, the person's own included", async () => {
  const { dialog } = await renderModal(createServices());

  await expect
    .element(dialog.getByRole("heading", { name: "¿Cerrar todas las sesiones?" }))
    .toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "Se cierran todas las sesiones abiertas del backoffice, también la tuya. Cada persona, vos incluido, vuelve a entrar con su passkey.",
      ),
    )
    .toBeVisible();
});

test("renders nothing while closed", async () => {
  const { screen } = await renderModal(createServices(), {}, false);

  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("Cancelar calls onClose without ending any session", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const { dialog } = await renderModal(services, { onClose });

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => onClose.mock.calls.length).toBe(1);
  expect(services.endEverySession).not.toHaveBeenCalled();
});

test("reports the session as ended once every session is closed", async () => {
  const services = createServices();
  vi.mocked(services.endEverySession).mockResolvedValue({ kind: "ok" });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal(services, { onSessionEnded });

  await userEvent.click(dialog.getByRole("button", { name: "Cerrar todas las sesiones" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
  expect(services.endEverySession).toHaveBeenCalledTimes(1);
});

test("reports the session as ended when it was already closed", async () => {
  const services = createServices();
  vi.mocked(services.endEverySession).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal(services, { onSessionEnded });

  await userEvent.click(dialog.getByRole("button", { name: "Cerrar todas las sesiones" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when the cloud refuses the action", async () => {
  window.history.pushState(null, "", "/users");
  const services = createServices();
  vi.mocked(services.endEverySession).mockResolvedValue({ kind: "forbidden" });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal(services, { onSessionEnded });

  await userEvent.click(dialog.getByRole("button", { name: "Cerrar todas las sesiones" }));

  await expect.poll(() => window.location.pathname).toBe("/account");
  expect(onSessionEnded).not.toHaveBeenCalled();
});

test("shows when to retry after a rate-limited answer and lets the person try again", async () => {
  const services = createServices();
  vi.mocked(services.endEverySession).mockResolvedValueOnce({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  vi.mocked(services.endEverySession).mockResolvedValueOnce({ kind: "ok" });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal(services, { onSessionEnded });

  await userEvent.click(dialog.getByRole("button", { name: "Cerrar todas las sesiones" }));

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Cerrar todas las sesiones" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
  expect(dialog.getByText("Demasiadas solicitudes").query()).toBeNull();
});

test("shows an inline failure and keeps the modal open when the sessions could not be closed", async () => {
  const services = createServices();
  vi.mocked(services.endEverySession).mockResolvedValue({ kind: "failed" });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal(services, { onSessionEnded });

  await userEvent.click(dialog.getByRole("button", { name: "Cerrar todas las sesiones" }));

  await expect.element(dialog.getByText("No se pudieron cerrar las sesiones")).toBeVisible();
  await expect.element(dialog.getByText("Probá de nuevo.")).toBeVisible();
  expect(onSessionEnded).not.toHaveBeenCalled();
});
