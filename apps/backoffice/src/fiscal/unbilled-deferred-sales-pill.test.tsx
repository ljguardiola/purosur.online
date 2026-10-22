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

function servicesAnswering(
  outcome: Awaited<ReturnType<UnbilledDeferredSalesPillServices["fetchUnbilledDeferredSales"]>>,
): UnbilledDeferredSalesPillServices {
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

test("counts the unbilled deferred sales as a link that opens the fiscal tasks", async () => {
  const screen = await renderPill(servicesAnswering({ kind: "ok", value: unbilledDeferredSales }));

  const link = screen.getByRole("link", {
    name: "3 ventas diferidas sin facturar · la más vieja de hace 6 días",
  });
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
  expect(screen.getByRole("link").query()).toBeNull();
  expect(screen.container.querySelector("main")?.textContent).toBe("");
});

test("shows nothing while the count loads", async () => {
  const screen = await renderPill({
    fetchUnbilledDeferredSales: vi.fn().mockReturnValue(new Promise(() => {})),
  });

  expect(screen.container.querySelector("main")?.textContent).toBe("");
});

test("shows nothing, staying on the screen, when the cloud refuses the count", async () => {
  const services = servicesAnswering({ kind: "forbidden" });
  const screen = await renderPill(services);

  await expect.poll(() => vi.mocked(services.fetchUnbilledDeferredSales).mock.calls.length).toBe(1);
  expect(screen.container.querySelector("main")?.textContent).toBe("");
  expect(window.location.pathname).toBe("/inventory");
});

test("shows nothing when the count cannot be read", async () => {
  const services = servicesAnswering({ kind: "failed" });
  const screen = await renderPill(services);

  await expect.poll(() => vi.mocked(services.fetchUnbilledDeferredSales).mock.calls.length).toBe(1);
  expect(screen.container.querySelector("main")?.textContent).toBe("");
});

test("ends the session when the count finds no open session", async () => {
  const onSessionEnded = vi.fn();

  await renderPill(servicesAnswering({ kind: "unauthenticated" }), onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
