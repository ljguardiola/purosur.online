import type { UnbilledDeferredSales } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { unbilledDeferredSales } from "./test-support/fiscal-task-fixtures";
import { UnbilledDeferredSalesPill } from "./unbilled-deferred-sales-pill";
import type { UnbilledDeferredSalesPillServices } from "./unbilled-deferred-sales-pill-services";

beforeEach(() => {
  window.history.replaceState(null, "", "/inventory");
});

type FetchOutcome = Awaited<
  ReturnType<UnbilledDeferredSalesPillServices["fetchUnbilledDeferredSales"]>
>;

function servicesAnswering(outcome: FetchOutcome): UnbilledDeferredSalesPillServices {
  return { fetchUnbilledDeferredSales: vi.fn().mockResolvedValue(outcome) };
}

function renderPill(services: UnbilledDeferredSalesPillServices, onSessionEnded = () => {}) {
  return render(
    <main>
      <UnbilledDeferredSalesPill services={services} onSessionEnded={onSessionEnded} />
    </main>,
  );
}

const none: UnbilledDeferredSales = { count: 0, oldest: null };

const countName = "3 ventas diferidas sin facturar · la más vieja de hace 6 días";

test("counts the unbilled deferred sales as a link that opens the fiscal tasks", async () => {
  const screen = await renderPill(servicesAnswering({ kind: "ok", value: unbilledDeferredSales }));

  const link = screen.getByRole("link", { name: countName });
  await expect.element(link).toBeVisible();
  await expectNoAccessibilityViolations(document.body);

  await userEvent.click(link);

  await expect.poll(() => window.location.pathname).toBe("/fiscal-tasks");
});

test("offers no way to dismiss the count", async () => {
  const screen = await renderPill(servicesAnswering({ kind: "ok", value: unbilledDeferredSales }));
  await expect.element(screen.getByRole("link")).toBeVisible();

  expect(screen.getByRole("button").query()).toBeNull();
});

test("shows nothing once it reads that no deferred sale is unbilled", async () => {
  const services = servicesAnswering({ kind: "ok", value: none });
  const screen = await renderPill(services);

  await expect.poll(() => vi.mocked(services.fetchUnbilledDeferredSales).mock.calls.length).toBe(1);
  await expect.poll(() => screen.container.querySelector("main")?.textContent).toBe("");
  expect(screen.getByRole("link").query()).toBeNull();
});

const retryName = "No pudimos abrir las ventas diferidas sin facturar. Reintentar";

test("holds the count's place with a loading pill while it loads", async () => {
  const screen = await renderPill({
    fetchUnbilledDeferredSales: vi.fn().mockReturnValue(new Promise(() => {})),
  });

  await expect.element(screen.getByRole("status")).toHaveTextContent("Cargando…");
  expect(screen.getByRole("link").query()).toBeNull();
});

test("offers to read the count again, staying on the screen, when the cloud refuses it", async () => {
  const fetchUnbilledDeferredSales = vi
    .fn<UnbilledDeferredSalesPillServices["fetchUnbilledDeferredSales"]>()
    .mockResolvedValueOnce({ kind: "forbidden" })
    .mockResolvedValueOnce({ kind: "ok", value: unbilledDeferredSales });
  const screen = await renderPill({ fetchUnbilledDeferredSales });

  const retry = screen.getByRole("button", { name: retryName });
  await expect.element(retry).toBeVisible();
  expect(window.location.pathname).toBe("/inventory");

  await userEvent.click(retry);

  await expect.element(screen.getByRole("link", { name: countName })).toBeVisible();
  expect(window.location.pathname).toBe("/inventory");
});

test("offers to read the count again when it cannot be read, from its loading pill", async () => {
  let answerRetry: (outcome: FetchOutcome) => void = () => {};
  const fetchUnbilledDeferredSales = vi
    .fn<UnbilledDeferredSalesPillServices["fetchUnbilledDeferredSales"]>()
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(
      new Promise((resolve) => {
        answerRetry = resolve;
      }),
    );
  const screen = await renderPill({ fetchUnbilledDeferredSales });

  const retry = screen.getByRole("button", { name: retryName });
  await expect.element(retry).toBeVisible();
  expect(screen.getByRole("link").query()).toBeNull();
  await expectNoAccessibilityViolations(document.body);

  await userEvent.click(retry);

  await expect.element(screen.getByRole("status")).toHaveTextContent("Cargando…");
  answerRetry({ kind: "ok", value: unbilledDeferredSales });
  await expect.element(screen.getByRole("link", { name: countName })).toBeVisible();
  expect(fetchUnbilledDeferredSales).toHaveBeenCalledTimes(2);
});

test("offers to read the count again when the cloud asks to wait before reading it", async () => {
  const screen = await renderPill(
    servicesAnswering({ kind: "rate_limited", retryAfterSeconds: 30 }),
  );

  await expect
    .element(screen.getByRole("button", { name: "Demasiadas solicitudes. Reintentar" }))
    .toBeVisible();
});

test("ends the session when the count finds no open session", async () => {
  const onSessionEnded = vi.fn();

  await renderPill(servicesAnswering({ kind: "unauthenticated" }), onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
