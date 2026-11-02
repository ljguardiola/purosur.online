import { expect, test, vi } from "vitest";
import { cloudLoadFailure } from "./cloud-load-failure";

test("a failed read names what could not be opened and offers to retry", () => {
  const retry = vi.fn();

  const failure = cloudLoadFailure({ status: "failed", retry }, "la sucursal");

  expect(failure).toMatchObject({
    title: "No pudimos abrir la sucursal",
    description: "Probá de nuevo en unos minutos.",
  });
  failure.onRetry();
  expect(retry).toHaveBeenCalledTimes(1);
});

test("a rate-limited read says so and when to try again", () => {
  const retry = vi.fn();

  const failure = cloudLoadFailure(
    { status: "failed", retryAfterSeconds: 120, retry },
    "la sucursal",
  );

  expect(failure).toMatchObject({
    title: "Demasiadas solicitudes",
    description: "Se puede volver a intentar en 2 minutos.",
  });
  failure.onRetry();
  expect(retry).toHaveBeenCalledTimes(1);
});

test("a failed read of an outdated tab says the backoffice was updated and retrying reloads the page", () => {
  const retry = vi.fn();
  const reloadPage = vi.fn();

  const failure = cloudLoadFailure(
    { status: "failed", retry, outdated: true },
    "la sucursal",
    reloadPage,
  );

  expect(failure).toMatchObject({
    title: "Se actualizó el backoffice",
    description: "Recargá la página para seguir.",
  });
  failure.onRetry();
  expect(reloadPage).toHaveBeenCalledTimes(1);
  expect(retry).not.toHaveBeenCalled();
});

test("a rate-limited read of an outdated tab still says when to try again", () => {
  const retry = vi.fn();

  const failure = cloudLoadFailure(
    { status: "failed", retryAfterSeconds: 120, retry, outdated: true },
    "la sucursal",
    vi.fn(),
  );

  expect(failure).toMatchObject({ title: "Demasiadas solicitudes" });
  failure.onRetry();
  expect(retry).toHaveBeenCalledTimes(1);
});
