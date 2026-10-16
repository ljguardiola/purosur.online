import { useState } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { type RevocationAttemptServices, useRevocationAttempt } from "./use-revocation-attempt";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

type FakeOutcome =
  | { kind: "ok" }
  | { kind: "gone" }
  | { kind: "authorization_required" }
  | { kind: "unauthenticated" }
  | { kind: "forbidden" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

function createServices(): RevocationAttemptServices {
  return {
    fetchSessionAuthorizationOptions: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { challenge: "session-auth" },
    }),
    startAuthentication: vi.fn().mockResolvedValue({ id: "existing-cred" }),
    authorizeSession: vi.fn().mockResolvedValue({ kind: "ok" }),
  };
}

type HarnessProps = {
  request: () => Promise<FakeOutcome>;
  onSettled?: (kind: string, current: boolean) => void;
  onSessionEnded?: () => void;
  services?: RevocationAttemptServices;
};

function Harness({
  request,
  onSettled = () => {},
  onSessionEnded = () => {},
  services = createServices(),
}: HarnessProps) {
  const [open, setOpen] = useState(true);
  const { attempt, revoking, notice, modal } = useRevocationAttempt<FakeOutcome, "gone">({
    open,
    actionName: "Revocar la prueba",
    onSessionEnded,
    services,
  });
  return (
    <main>
      <button
        type="button"
        onClick={() =>
          void attempt(request, (outcome, opening) => {
            onSettled(outcome.kind, opening.current);
            if (outcome.kind === "gone") {
              opening.showNotice("gone");
            }
          })
        }
      >
        Revocar
      </button>
      <button type="button" onClick={() => setOpen(false)}>
        Cerrar
      </button>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir
      </button>
      <output aria-label="Aviso">{notice === null ? "" : JSON.stringify(notice)}</output>
      <output aria-label="Estado">{revoking ? "Revocando" : "En espera"}</output>
      {modal}
    </main>
  );
}

async function renderHarness(props: HarnessProps) {
  const element = <Harness {...props} />;
  const screen = await render(element);
  return Object.assign(screen, { settle: () => screen.rerender(element) });
}

type HarnessScreen = Awaited<ReturnType<typeof renderHarness>>;

function pending() {
  let answer: (outcome: FakeOutcome) => void = () => {};
  const request = vi.fn<() => Promise<FakeOutcome>>().mockReturnValue(
    new Promise((resolve) => {
      answer = resolve;
    }),
  );
  return { request, answer: (outcome: FakeOutcome) => answer(outcome) };
}

async function revoke(screen: HarnessScreen) {
  await userEvent.click(screen.getByRole("button", { name: "Revocar" }));
}

function noticeOf(screen: HarnessScreen) {
  return screen.getByRole("status", { name: "Aviso" });
}

function stateOf(screen: HarnessScreen) {
  return screen.getByRole("status", { name: "Estado" });
}

test("hands its own outcome to the operation while the opening is current", async () => {
  const onSettled = vi.fn();
  const screen = await renderHarness({
    request: vi.fn().mockResolvedValue({ kind: "ok" }),
    onSettled,
  });

  await revoke(screen);

  await expect.poll(() => onSettled.mock.calls).toEqual([["ok", true]]);
});

test("shows the notice the operation chooses for its own outcome", async () => {
  const screen = await renderHarness({ request: vi.fn().mockResolvedValue({ kind: "gone" }) });

  await revoke(screen);

  await expect.element(noticeOf(screen)).toHaveTextContent('{"kind":"gone"}');
});

test("shows the attempt-failed notice when the attempt fails", async () => {
  const onSettled = vi.fn();
  const screen = await renderHarness({
    request: vi.fn().mockResolvedValue({ kind: "failed" }),
    onSettled,
  });

  await revoke(screen);

  await expect.element(noticeOf(screen)).toHaveTextContent('{"kind":"attemptFailed"}');
  expect(onSettled).not.toHaveBeenCalled();
});

test("shows the attempt-failed notice when the attempt still asks for authorization after the passkey", async () => {
  const onSettled = vi.fn();
  const request = vi.fn().mockResolvedValue({ kind: "authorization_required" });
  const screen = await renderHarness({ request, onSettled });
  await revoke(screen);
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });

  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.element(noticeOf(screen)).toHaveTextContent('{"kind":"attemptFailed"}');
  expect(request).toHaveBeenCalledTimes(2);
  expect(onSettled).not.toHaveBeenCalled();
});

test("shows the rate-limited notice with how long to wait", async () => {
  const screen = await renderHarness({
    request: vi.fn().mockResolvedValue({ kind: "rate_limited", retryAfterSeconds: 120 }),
  });

  await revoke(screen);

  await expect
    .element(noticeOf(screen))
    .toHaveTextContent('{"kind":"rateLimited","retryAfterSeconds":120}');
});

test("ends the session when the attempt finds no open session", async () => {
  const onSessionEnded = vi.fn();
  const onSettled = vi.fn();
  const screen = await renderHarness({
    request: vi.fn().mockResolvedValue({ kind: "unauthenticated" }),
    onSessionEnded,
    onSettled,
  });

  await revoke(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
  expect(onSettled).not.toHaveBeenCalled();
});

test("sends the person to Mi cuenta when the attempt comes back forbidden", async () => {
  window.history.pushState(null, "", "/registers");
  const screen = await renderHarness({ request: vi.fn().mockResolvedValue({ kind: "forbidden" }) });

  await revoke(screen);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("hands nothing to the operation and shows nothing when the authorization is cancelled", async () => {
  const onSettled = vi.fn();
  const screen = await renderHarness({
    request: vi.fn().mockResolvedValue({ kind: "authorization_required" }),
    onSettled,
  });
  await revoke(screen);
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });

  await userEvent.click(authDialog.getByRole("button", { name: "Cancelar" }));

  await expect.element(stateOf(screen)).toHaveTextContent("En espera");
  await expect.element(noticeOf(screen)).toHaveTextContent("");
  expect(onSettled).not.toHaveBeenCalled();
});

test("is revoking while the attempt is pending, and no longer once it answers", async () => {
  const { request, answer } = pending();
  const screen = await renderHarness({ request });
  await revoke(screen);
  await expect.element(stateOf(screen)).toHaveTextContent("Revocando");

  answer({ kind: "ok" });

  await expect.element(stateOf(screen)).toHaveTextContent("En espera");
});

test("hands a late outcome to the operation as no longer current once it was closed", async () => {
  const { request, answer } = pending();
  const onSettled = vi.fn();
  const screen = await renderHarness({ request, onSettled });
  await revoke(screen);
  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

  answer({ kind: "ok" });
  await screen.settle();

  await expect.poll(() => onSettled.mock.calls).toEqual([["ok", false]]);
});

test("ignores a failure that arrives after it was closed, once it opens again", async () => {
  const { request, answer } = pending();
  const screen = await renderHarness({ request });
  await revoke(screen);
  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

  answer({ kind: "failed" });
  await screen.settle();
  await userEvent.click(screen.getByRole("button", { name: "Abrir" }));

  await expect.element(noticeOf(screen)).toHaveTextContent("");
});

test("ignores a failure from an earlier opening that arrives after it opened again", async () => {
  const { request, answer } = pending();
  const screen = await renderHarness({ request });
  await revoke(screen);
  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));
  await userEvent.click(screen.getByRole("button", { name: "Abrir" }));

  answer({ kind: "failed" });
  await screen.settle();

  await expect.element(noticeOf(screen)).toHaveTextContent("");
  await expect.element(stateOf(screen)).toHaveTextContent("En espera");
});

test("clears the notice of the previous opening when it opens again", async () => {
  const screen = await renderHarness({ request: vi.fn().mockResolvedValue({ kind: "failed" }) });
  await revoke(screen);
  await expect.element(noticeOf(screen)).toHaveTextContent('{"kind":"attemptFailed"}');

  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));
  await userEvent.click(screen.getByRole("button", { name: "Abrir" }));

  await expect.element(noticeOf(screen)).toHaveTextContent("");
});

test("ends the session when no open session is found after it was closed", async () => {
  const { request, answer } = pending();
  const onSessionEnded = vi.fn();
  const screen = await renderHarness({ request, onSessionEnded });
  await revoke(screen);
  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

  answer({ kind: "unauthenticated" });
  await screen.settle();

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("sends the person to Mi cuenta when the attempt comes back forbidden after it was closed", async () => {
  window.history.pushState(null, "", "/registers");
  const { request, answer } = pending();
  const screen = await renderHarness({ request });
  await revoke(screen);
  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

  answer({ kind: "forbidden" });
  await screen.settle();

  await expect.poll(() => window.location.pathname).toBe("/account");
});
