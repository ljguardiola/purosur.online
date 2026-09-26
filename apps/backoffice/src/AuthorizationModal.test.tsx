import { useState } from "react";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import {
  type AuthorizationActionKey,
  type AuthorizationServices,
  useAuthorization,
} from "./AuthorizationModal";
import { messages } from "./messages";

type FakeOutcome =
  | { kind: "ok"; value: string }
  | { kind: "authorization_required" }
  | { kind: "failed" }
  | { kind: "unauthenticated" };

function createServices(overrides: Partial<AuthorizationServices> = {}): AuthorizationServices {
  return {
    fetchSessionAuthorizationOptions: vi.fn(),
    authorizeSession: vi.fn(),
    startAuthentication: vi.fn(),
    ...overrides,
  };
}

function Harness({
  attempt,
  services,
  onSessionEnded = () => {},
}: {
  attempt: () => Promise<FakeOutcome>;
  services: AuthorizationServices;
  onSessionEnded?: () => void;
}) {
  const [result, setResult] = useState<string | null>(null);
  const { run, modal } = useAuthorization<FakeOutcome>({
    action: "roleSave",
    onSessionEnded,
    services,
  });
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          void run(attempt).then((outcome) => setResult(JSON.stringify(outcome)));
        }}
      >
        Run
      </button>
      {result && <p>{result}</p>}
      {modal}
    </div>
  );
}

const authorizationOptions = { challenge: "session-auth" } as never;
const assertion = { id: "existing-cred" } as never;

test("runs the action once and never opens the modal when it succeeds directly", async () => {
  const services = createServices();
  const attempt = vi
    .fn<() => Promise<FakeOutcome>>()
    .mockResolvedValue({ kind: "ok", value: "done" });
  const screen = await render(<Harness attempt={attempt} services={services} />);

  await userEvent.click(screen.getByRole("button", { name: "Run" }));

  await expect.element(screen.getByText('{"kind":"ok","value":"done"}')).toBeVisible();
  expect(screen.getByRole("dialog").query()).toBeNull();
  expect(services.fetchSessionAuthorizationOptions).not.toHaveBeenCalled();
});

test("opens the modal with the action sentence when the action answers authorization_required", async () => {
  const services = createServices();
  vi.mocked(services.fetchSessionAuthorizationOptions).mockReturnValue(new Promise(() => {}));
  const attempt = vi
    .fn<() => Promise<FakeOutcome>>()
    .mockResolvedValue({ kind: "authorization_required" });
  const screen = await render(<Harness attempt={attempt} services={services} />);

  await userEvent.click(screen.getByRole("button", { name: "Run" }));

  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("heading", { name: "Autorizá este cambio" })).toBeVisible();
  await expect
    .element(
      dialog.getByText("Guardar un rol necesita tu autorización. Confirmala con tu passkey."),
    )
    .toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Cancelar" })).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Usar mi passkey" })).toBeVisible();
});

test("authorizes and retries the action exactly once, resolving with the retried outcome", async () => {
  const services = createServices();
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: authorizationOptions,
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(assertion);
  vi.mocked(services.authorizeSession).mockResolvedValue({ kind: "ok" });
  const attempt = vi
    .fn<() => Promise<FakeOutcome>>()
    .mockResolvedValueOnce({ kind: "authorization_required" })
    .mockResolvedValueOnce({ kind: "ok", value: "retried" });
  const screen = await render(<Harness attempt={attempt} services={services} />);
  await userEvent.click(screen.getByRole("button", { name: "Run" }));
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("heading", { name: "Autorizá este cambio" })).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Usar mi passkey" }));

  expect(services.startAuthentication).toHaveBeenCalledWith({ optionsJSON: authorizationOptions });
  expect(services.authorizeSession).toHaveBeenCalledWith(assertion);
  await expect.poll(() => attempt.mock.calls.length).toBe(2);
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText('{"kind":"ok","value":"retried"}')).toBeVisible();
});

test("cancel closes the modal, resolves cancelled, and never retries the action", async () => {
  const services = createServices();
  const attempt = vi
    .fn<() => Promise<FakeOutcome>>()
    .mockResolvedValue({ kind: "authorization_required" });
  const screen = await render(<Harness attempt={attempt} services={services} />);
  await userEvent.click(screen.getByRole("button", { name: "Run" }));
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("heading", { name: "Autorizá este cambio" })).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText('{"kind":"cancelled"}')).toBeVisible();
  expect(attempt).toHaveBeenCalledTimes(1);
  expect(services.fetchSessionAuthorizationOptions).not.toHaveBeenCalled();
});

test("shows an error inside the modal, without closing it, when the browser cancels the passkey ceremony", async () => {
  const services = createServices();
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: authorizationOptions,
  });
  vi.mocked(services.startAuthentication).mockRejectedValue(new Error("NotAllowedError"));
  const attempt = vi
    .fn<() => Promise<FakeOutcome>>()
    .mockResolvedValue({ kind: "authorization_required" });
  const screen = await render(<Harness attempt={attempt} services={services} />);
  await userEvent.click(screen.getByRole("button", { name: "Run" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.element(dialog.getByText("No se pudo confirmar con tu passkey")).toBeVisible();
  expect(services.authorizeSession).not.toHaveBeenCalled();
  expect(attempt).toHaveBeenCalledTimes(1);

  // The modal is still open, so the person can try again.
  vi.mocked(services.startAuthentication).mockResolvedValue(assertion);
  vi.mocked(services.authorizeSession).mockResolvedValue({ kind: "ok" });
  attempt.mockResolvedValueOnce({ kind: "ok", value: "retried" });

  await userEvent.click(dialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText('{"kind":"ok","value":"retried"}')).toBeVisible();
});

test("shows an error inside the modal when the authorization itself is rejected", async () => {
  const services = createServices();
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: authorizationOptions,
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(assertion);
  vi.mocked(services.authorizeSession).mockResolvedValue({ kind: "authentication_failed" });
  const attempt = vi
    .fn<() => Promise<FakeOutcome>>()
    .mockResolvedValue({ kind: "authorization_required" });
  const screen = await render(<Harness attempt={attempt} services={services} />);
  await userEvent.click(screen.getByRole("button", { name: "Run" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.element(dialog.getByText("No se pudo confirmar con tu passkey")).toBeVisible();
  expect(attempt).toHaveBeenCalledTimes(1);
});

test("shows a rate-limited notice when fetching the authorization options is rate limited", async () => {
  const services = createServices();
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 60,
  });
  const attempt = vi
    .fn<() => Promise<FakeOutcome>>()
    .mockResolvedValue({ kind: "authorization_required" });
  const screen = await render(<Harness attempt={attempt} services={services} />);
  await userEvent.click(screen.getByRole("button", { name: "Run" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
  expect(services.startAuthentication).not.toHaveBeenCalled();
});

test("shows a rate-limited notice when authorizing itself is rate limited", async () => {
  const services = createServices();
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: authorizationOptions,
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(assertion);
  vi.mocked(services.authorizeSession).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 90,
  });
  const attempt = vi
    .fn<() => Promise<FakeOutcome>>()
    .mockResolvedValue({ kind: "authorization_required" });
  const screen = await render(<Harness attempt={attempt} services={services} />);
  await userEvent.click(screen.getByRole("button", { name: "Run" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("ends the session, without retrying and settling run as cancelled, when fetching the authorization options finds the session already ended", async () => {
  const services = createServices();
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "unauthenticated",
  });
  const onSessionEnded = vi.fn();
  const attempt = vi
    .fn<() => Promise<FakeOutcome>>()
    .mockResolvedValue({ kind: "authorization_required" });
  const screen = await render(
    <Harness attempt={attempt} services={services} onSessionEnded={onSessionEnded} />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Run" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
  expect(attempt).toHaveBeenCalledTimes(1);
  await expect.element(screen.getByText('{"kind":"cancelled"}')).toBeVisible();
  expect(onSessionEnded).toHaveBeenCalledTimes(1);
});

test("ends the session, without retrying and settling run as cancelled, when authorizing finds the session already ended", async () => {
  const services = createServices();
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: authorizationOptions,
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(assertion);
  vi.mocked(services.authorizeSession).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const attempt = vi
    .fn<() => Promise<FakeOutcome>>()
    .mockResolvedValue({ kind: "authorization_required" });
  const screen = await render(
    <Harness attempt={attempt} services={services} onSessionEnded={onSessionEnded} />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Run" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
  expect(attempt).toHaveBeenCalledTimes(1);
  await expect.element(screen.getByText('{"kind":"cancelled"}')).toBeVisible();
  expect(onSessionEnded).toHaveBeenCalledTimes(1);
});

test("shows each catalog action key's own sentence", async () => {
  const services = createServices();
  const attempt = vi
    .fn<() => Promise<FakeOutcome>>()
    .mockResolvedValue({ kind: "authorization_required" });
  const expectedSentences: Record<AuthorizationActionKey, string> = {
    roleSave: "Guardar un rol necesita tu autorización. Confirmala con tu passkey.",
    userCreate: "Crear un usuario necesita tu autorización. Confirmala con tu passkey.",
    userEdit: "Editar un usuario necesita tu autorización. Confirmala con tu passkey.",
    passkeyRemoval: "Dar de baja una passkey necesita tu autorización. Confirmala con tu passkey.",
    passkeyRegistration: "Agregar una passkey necesita tu autorización. Confirmala con tu passkey.",
    userDeactivation: "Desactivar un usuario necesita tu autorización. Confirmala con tu passkey.",
    userReactivation: "Reactivar un usuario necesita tu autorización. Confirmala con tu passkey.",
    issuerIdentificationSave:
      "Guardar la identificación del emisor necesita tu autorización. Confirmala con tu passkey.",
    registerCreate: "Crear una caja necesita tu autorización. Confirmala con tu passkey.",
    registerEnrollmentCodeIssue:
      "Emitir un código de alta necesita tu autorización. Confirmala con tu passkey.",
  };

  function ActionHarness({ action }: { action: AuthorizationActionKey }) {
    const { run, modal } = useAuthorization<FakeOutcome>({
      action,
      onSessionEnded: () => {},
      services,
    });
    return (
      <div>
        <button type="button" onClick={() => void run(attempt)}>
          Run
        </button>
        {modal}
      </div>
    );
  }

  const actionKeys = Object.keys(messages.passkeyAuthorization.actions) as AuthorizationActionKey[];
  expect([...actionKeys].sort()).toEqual(Object.keys(expectedSentences).sort());
  for (const action of actionKeys) {
    const screen = await render(<ActionHarness action={action} />);
    await userEvent.click(screen.getByRole("button", { name: "Run" }));
    await expect
      .element(screen.getByRole("dialog").getByText(expectedSentences[action]))
      .toBeVisible();
    await screen.unmount();
  }
});

test("has no accessibility violations with the authorization modal open", async () => {
  const services = createServices();
  const attempt = vi
    .fn<() => Promise<FakeOutcome>>()
    .mockResolvedValue({ kind: "authorization_required" });
  const screen = await render(<Harness attempt={attempt} services={services} />);

  await userEvent.click(screen.getByRole("button", { name: "Run" }));
  await expect.element(screen.getByRole("dialog")).toBeVisible();

  await expectNoAccessibilityViolations(document.body);
});
