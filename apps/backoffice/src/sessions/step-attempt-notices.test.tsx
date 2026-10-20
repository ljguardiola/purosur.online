import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { StepAttemptNotices } from "./step-attempt-notices";

function renderNotice(notice: Parameters<typeof StepAttemptNotices>[0]["notice"]) {
  return render(<StepAttemptNotices notice={notice} failedTitle="No se pudo hacer la prueba" />);
}

test("shows nothing without a notice", async () => {
  const screen = await renderNotice(null);

  expect(screen.container.textContent).toBe("");
});

test("says the attempt failed with the title it was given", async () => {
  const screen = await renderNotice({ kind: "attemptFailed" });

  await expect.element(screen.getByText("No se pudo hacer la prueba")).toBeVisible();
  await expect.element(screen.getByText("Probá de nuevo.")).toBeVisible();
});

test("says how long to wait when the attempt was rate limited", async () => {
  const screen = await renderNotice({ kind: "rateLimited", retryAfterSeconds: 120 });

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("says the runbook changed", async () => {
  const screen = await renderNotice({ kind: "outdated" });

  await expect.element(screen.getByText("El instructivo cambió")).toBeVisible();
});

test("says the chosen account is gone", async () => {
  const screen = await renderNotice({ kind: "notFound" });

  await expect.element(screen.getByText("Esa cuenta ya no existe")).toBeVisible();
});

test("says the chosen account cannot be the caller's own", async () => {
  const screen = await renderNotice({ kind: "ownAccount" });

  await expect.element(screen.getByText("No podés elegir tu propia cuenta")).toBeVisible();
});
