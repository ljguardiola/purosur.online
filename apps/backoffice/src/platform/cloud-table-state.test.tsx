import { expect, test, vi } from "vitest";
import { cloudTableState } from "./cloud-table-state";
import type { CloudData } from "./use-cloud-query";

const loaded = (refreshing: boolean): CloudData<string[]> => ({
  status: "loaded",
  value: [],
  refreshing,
});

test("a table waiting for its first data shows its placeholders", () => {
  expect(cloudTableState({ status: "loading" }, "las categorías")).toEqual({ loading: "initial" });
});

test("a table refreshing rows already shown keeps them and shows the updating bar", () => {
  expect(cloudTableState(loaded(true), "las categorías")).toEqual({ loading: "updating" });
});

test("a loaded table shows no loading state", () => {
  expect(cloudTableState(loaded(false), "las categorías")).toEqual({ loading: false });
});

test("a failed read names what could not be opened and offers to retry", () => {
  const retry = vi.fn();

  const state = cloudTableState({ status: "failed", retry }, "las categorías");

  expect(state).toMatchObject({
    failure: {
      title: "No pudimos abrir las categorías",
      description: "Probá de nuevo en unos minutos.",
    },
  });
  if ("failure" in state) {
    state.failure.onRetry();
  }
  expect(retry).toHaveBeenCalledTimes(1);
});

test("a rate-limited read says so and when to try again", () => {
  const state = cloudTableState(
    { status: "failed", retryAfterSeconds: 120, retry: () => {} },
    "las categorías",
  );

  expect(state).toMatchObject({
    failure: {
      title: "Demasiadas solicitudes",
      description: "Se puede volver a intentar en 2 minutos.",
    },
  });
});
