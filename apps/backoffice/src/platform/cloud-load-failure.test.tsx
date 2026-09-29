import { expect, test, vi } from "vitest";
import { cloudLoadFailure } from "./cloud-load-failure";

test("a failed read names what could not be opened and offers to retry", () => {
  const retry = vi.fn();

  const failure = cloudLoadFailure({ status: "failed", retry }, "la alerta");

  expect(failure).toMatchObject({
    title: "No pudimos abrir la alerta",
    description: "Probá de nuevo en unos minutos.",
  });
  failure.onRetry();
  expect(retry).toHaveBeenCalledTimes(1);
});

test("a rate-limited read says so and when to try again", () => {
  const retry = vi.fn();

  const failure = cloudLoadFailure(
    { status: "failed", retryAfterSeconds: 120, retry },
    "la alerta",
  );

  expect(failure).toMatchObject({
    title: "Demasiadas solicitudes",
    description: "Se puede volver a intentar en 2 minutos.",
  });
  failure.onRetry();
  expect(retry).toHaveBeenCalledTimes(1);
});
