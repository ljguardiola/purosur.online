import type { PriceList } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { fiscalTasks, noFiscalTasks } from "../fiscal/test-support/fiscal-task-fixtures";
import {
  noPendingRefunds,
  pendingRefundsWithUnconfirmedCloudRefund,
} from "../payments/test-support/refund-fixtures";
import type { BackofficeAccess } from "./backoffice-access";
import { PendingTasksSection, type PendingTasksSectionServices } from "./pending-tasks-section";
import { ADMINISTRATOR_ACCESS, accessWith } from "./test-support/backoffice-access";
import { render } from "./test-support/render-with-router";

const priceList = (pendingCount: number): PriceList => ({
  products: [],
  categories: [],
  pendingCount,
  activeProductCount: 10,
  reviewWindowDays: 30,
});

function createServices(): PendingTasksSectionServices {
  return {
    fetchFiscalTasks: vi
      .fn<PendingTasksSectionServices["fetchFiscalTasks"]>()
      .mockResolvedValue({ kind: "ok", value: fiscalTasks }),
    fetchPendingRefunds: vi
      .fn<PendingTasksSectionServices["fetchPendingRefunds"]>()
      .mockResolvedValue({ kind: "ok", value: pendingRefundsWithUnconfirmedCloudRefund }),
    fetchPrices: vi
      .fn<PendingTasksSectionServices["fetchPrices"]>()
      .mockResolvedValue({ kind: "ok", value: priceList(7) }),
  };
}

function renderSection(
  services: PendingTasksSectionServices,
  {
    access = ADMINISTRATOR_ACCESS,
    onSessionEnded = () => {},
  }: { access?: BackofficeAccess; onSessionEnded?: () => void } = {},
) {
  return render(
    <main>
      <PendingTasksSection access={access} onSessionEnded={onSessionEnded} services={services} />
    </main>,
  );
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function hrefOf(link: { element: () => Element }): string {
  return link.element().getAttribute("href") ?? "";
}

test("lists each pending task with its count as a link to the place where it is done", async () => {
  const services = createServices();

  const screen = await renderSection(services);

  await expect
    .element(screen.getByRole("heading", { name: "Tareas pendientes", level: 2 }))
    .toBeVisible();
  const fiscal = screen.getByRole("link", { name: `Tareas fiscales ${fiscalTasks.tasks.length}` });
  await expect.element(fiscal).toBeVisible();
  expect(hrefOf(fiscal)).toBe("/fiscal");
  const mercadoPago = screen.getByRole("link", { name: "Reembolsos por Mercado Pago 1" });
  expect(hrefOf(mercadoPago)).toBe("/refunds?channel=mercado-pago");
  const outside = screen.getByRole("link", { name: "Reembolsos fuera del sistema 1" });
  expect(hrefOf(outside)).toBe("/refunds?channel=without-api");
  const prices = screen.getByRole("link", { name: "Precios a revisar 7" });
  expect(hrefOf(prices)).toBe("/products/prices");
  expect(services.fetchPendingRefunds).toHaveBeenCalledTimes(1);
  await expectNoAccessibilityViolations(document.body);
});

test("lists no task whose count is zero", async () => {
  const services = createServices();
  vi.mocked(services.fetchFiscalTasks).mockResolvedValue({ kind: "ok", value: noFiscalTasks });
  vi.mocked(services.fetchPrices).mockResolvedValue({ kind: "ok", value: priceList(0) });

  const screen = await renderSection(services);

  await expect
    .element(screen.getByRole("link", { name: /^Reembolsos por Mercado Pago/ }))
    .toBeVisible();
  expect(screen.getByRole("link", { name: /^Tareas fiscales/ }).query()).toBeNull();
  expect(screen.getByRole("link", { name: /^Precios a revisar/ }).query()).toBeNull();
  expect(screen.getByText("No hay tareas pendientes").query()).toBeNull();
});

test("says there is nothing pending when every task the person sees has a count of zero", async () => {
  const services = createServices();
  vi.mocked(services.fetchFiscalTasks).mockResolvedValue({ kind: "ok", value: noFiscalTasks });
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: noPendingRefunds,
  });
  vi.mocked(services.fetchPrices).mockResolvedValue({ kind: "ok", value: priceList(0) });

  const screen = await renderSection(services);

  await expect.element(screen.getByText("No hay tareas pendientes")).toBeVisible();
  expect(screen.getByRole("link").query()).toBeNull();
  await expectNoAccessibilityViolations(document.body);
});

test.each([
  {
    capability: "fiscal_information",
    shown: ["Tareas fiscales"],
    asked: ["fetchFiscalTasks"],
  },
  {
    capability: "refunds_area",
    shown: ["Reembolsos por Mercado Pago", "Reembolsos fuera del sistema"],
    asked: ["fetchPendingRefunds"],
  },
  {
    capability: "prices_area",
    shown: ["Precios a revisar"],
    asked: ["fetchPrices"],
  },
] as const)(
  "shows only the tasks of $capability and asks the cloud only for their counts",
  async ({ capability, shown, asked }) => {
    const services = createServices();

    const screen = await renderSection(services, { access: accessWith(capability) });

    await expect.element(screen.getByRole("link").first()).toBeVisible();
    const names = screen
      .getByRole("link")
      .elements()
      .map((link) => link.textContent ?? "");
    expect(names).toHaveLength(shown.length);
    for (const [index, label] of shown.entries()) {
      expect(names[index]).toContain(label);
    }
    for (const name of ["fetchFiscalTasks", "fetchPendingRefunds", "fetchPrices"] as const) {
      if (asked.some((called) => called === name)) {
        expect(services[name]).toHaveBeenCalledTimes(1);
      } else {
        expect(services[name]).not.toHaveBeenCalled();
      }
    }
  },
);

test("renders nothing, asking the cloud for nothing, when the person sees no task", async () => {
  const services = createServices();

  const screen = await renderSection(services, { access: accessWith("alerts_area") });

  expect(screen.getByRole("heading", { name: "Tareas pendientes" }).query()).toBeNull();
  expect(screen.getByText("No hay tareas pendientes").query()).toBeNull();
  expect(services.fetchFiscalTasks).not.toHaveBeenCalled();
  expect(services.fetchPendingRefunds).not.toHaveBeenCalled();
  expect(services.fetchPrices).not.toHaveBeenCalled();
});

test("shows a card-shaped loading placeholder per task until its count arrives", async () => {
  const services = createServices();
  const load = deferred<Awaited<ReturnType<PendingTasksSectionServices["fetchPrices"]>>>();
  vi.mocked(services.fetchPrices).mockReturnValue(load.promise);

  const screen = await renderSection(services, { access: accessWith("prices_area") });

  await expect.element(screen.getByText("Cargando…").first()).toBeInTheDocument();
  expect(screen.getByText("No hay tareas pendientes").query()).toBeNull();
  load.resolve({ kind: "ok", value: priceList(7) });
  await expect.element(screen.getByRole("link", { name: "Precios a revisar 7" })).toBeVisible();
  expect(screen.getByText("Cargando…").query()).toBeNull();
});

test("shows a task's load error whose retry reads it again, beside the tasks that did load", async () => {
  const services = createServices();
  vi.mocked(services.fetchFiscalTasks)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: fiscalTasks });
  const screen = await renderSection(services);
  await expect.element(screen.getByText("No pudimos abrir las tareas fiscales")).toBeVisible();
  await expect.element(screen.getByRole("link", { name: "Precios a revisar 7" })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByRole("link", { name: `Tareas fiscales ${fiscalTasks.tasks.length}` }))
    .toBeVisible();
  expect(screen.getByText("No pudimos abrir las tareas fiscales").query()).toBeNull();
  expect(services.fetchPrices).toHaveBeenCalledTimes(1);
});

test("does not say there is nothing pending while a task failed to load", async () => {
  const services = createServices();
  vi.mocked(services.fetchFiscalTasks).mockResolvedValue({ kind: "failed" });
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: noPendingRefunds,
  });
  vi.mocked(services.fetchPrices).mockResolvedValue({ kind: "ok", value: priceList(0) });

  const screen = await renderSection(services);

  await expect.element(screen.getByText("No pudimos abrir las tareas fiscales")).toBeVisible();
  expect(screen.getByText("No hay tareas pendientes").query()).toBeNull();
});

test("shows a rate-limited notice for the task whose count was refused", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });

  const screen = await renderSection(services, { access: accessWith("prices_area") });

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
});

test("ends the session once when a count comes back unauthenticated", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderSection(services, { access: accessWith("prices_area"), onSessionEnded });

  await expect.poll(() => onSessionEnded).toHaveBeenCalled();
  expect(onSessionEnded).toHaveBeenCalledTimes(1);
});

test.each([
  {
    capability: "fiscal_information",
    service: "fetchFiscalTasks",
    refuse: (services: PendingTasksSectionServices) =>
      vi.mocked(services.fetchFiscalTasks).mockResolvedValueOnce({ kind: "forbidden" }),
    failure: "No pudimos abrir las tareas fiscales",
    link: `Tareas fiscales ${fiscalTasks.tasks.length}`,
  },
  {
    capability: "refunds_area",
    service: "fetchPendingRefunds",
    refuse: (services: PendingTasksSectionServices) =>
      vi.mocked(services.fetchPendingRefunds).mockResolvedValueOnce({ kind: "forbidden" }),
    failure: "No pudimos abrir los reembolsos",
    link: "Reembolsos por Mercado Pago 1",
  },
  {
    capability: "prices_area",
    service: "fetchPrices",
    refuse: (services: PendingTasksSectionServices) =>
      vi.mocked(services.fetchPrices).mockResolvedValueOnce({ kind: "forbidden" }),
    failure: "No pudimos abrir los precios a revisar",
    link: "Precios a revisar 7",
  },
] as const)(
  "offers to read the $service count again, staying on the page, when the cloud refuses it",
  async ({ capability, refuse, failure, link }) => {
    window.history.replaceState(null, "", "/?level=critical");
    const services = createServices();
    refuse(services);
    const screen = await renderSection(services, { access: accessWith(capability) });

    await expect.element(screen.getByText(failure)).toBeVisible();
    expect(window.location.pathname + window.location.search).toBe("/?level=critical");

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await expect.element(screen.getByRole("link", { name: link })).toBeVisible();
    expect(window.location.pathname + window.location.search).toBe("/?level=critical");
  },
);
