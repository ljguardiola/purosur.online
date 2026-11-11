import type { PendingRefundsBody } from "@purosur/contracts";
import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { pendingRefundsOfBothKinds } from "../payments/test-support/refund-fixtures";
import { returnsReport } from "../returns/test-support/returns-fixtures";
import { openSession } from "../sessions/test-support/open-session";
import { App, type AppServices } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { createBranchTermServices } from "./test-support/branch-term";
import { registers } from "./test-support/report-fixtures";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens(["/", "/help", "/refunds", "/refunds/history", "/fiscal/caea"]);

beforeEach(resetPageState);

const FRONT_REGISTER_ID = "33333333-3333-4333-8333-333333333333";
const BACK_REGISTER_ID = "22222222-2222-4222-8222-222222222222";

function refundsServices(capabilities: Capability[]) {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Lucía Ferreyra",
        isAdministrator: false,
        capabilities,
      }),
    ),
  });
  vi.mocked(services.ownCredentialsSection.fetchPasskeys).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  answerPendingRefunds(services, pendingRefundsOfBothKinds);
  vi.mocked(services.reportRegisterFilter.fetchReportRegisters).mockResolvedValue({
    kind: "ok",
    value: registers,
  });
  vi.mocked(services.returnsHistoryScreen.fetchReturnsReport).mockResolvedValue({
    kind: "ok",
    value: returnsReport,
  });
  return services;
}

function answerPendingRefunds(services: AppServices, refunds: PendingRefundsBody) {
  vi.mocked(services.pendingRefundsScreen.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: refunds,
  });
}

function location() {
  return window.location.pathname + window.location.search;
}

test("opens the page on Pendientes from the rail's Ventas y caja item, with both tabs, for a person who sees both", async () => {
  const services = refundsServices(["refunds_area", "returns_report"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("link", { name: "Ventas y caja", exact: true }));

  await expect
    .element(screen.getByRole("heading", { name: "Devoluciones y reembolsos", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByText("Ventas y caja", { exact: true }).first()).toBeVisible();
  await expect
    .element(screen.getByRole("tab", { name: "Pendientes", selected: true }))
    .toBeVisible();
  await expect.element(screen.getByRole("tab", { name: "Historial" })).toBeVisible();
  expect(location()).toBe("/refunds");
  await expect.element(screen.getByText("$ 3.400,00", { exact: true })).toBeVisible();
  expect(document.title).toBe("Devoluciones y reembolsos · Puro Sur");
  const sections = screen.getByRole("navigation", { name: "Ventas y caja" });
  await expect
    .element(sections.getByRole("link", { name: "Devoluciones y reembolsos" }))
    .toHaveAttribute("aria-current", "page");
});

test("lists Ventas y caja right after Inicio in the rail", async () => {
  const services = refundsServices(["refunds_area", "stock_area"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  const rail = screen.getByRole("navigation", { name: "Áreas" });
  await expect
    .element(rail.getByRole("link", { name: "Ventas y caja", exact: true }))
    .toBeVisible();
  const labels = rail
    .getByRole("link")
    .all()
    .map((link) => link.element().textContent?.trim());
  expect(labels.indexOf("Ventas y caja")).toBe(labels.indexOf("Inicio") + 1);
});

test("following the Historial tab opens the returns history, and Pendientes comes back", async () => {
  const services = refundsServices(["refunds_area", "returns_report"]);
  window.history.pushState(null, "", "/refunds?channel=outside-mercado-pago");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByText("$ 2.500,00", { exact: true })).toBeVisible();

  await userEvent.click(screen.getByRole("tab", { name: "Historial" }));

  await expect
    .element(screen.getByRole("tab", { name: "Historial", selected: true }))
    .toBeVisible();
  await expect
    .element(
      screen
        .getByRole("table", { name: "Devoluciones iniciadas con el número tipeado" })
        .getByText("Beto"),
    )
    .toBeVisible();
  expect(location()).toBe("/refunds/history");
  expect(services.returnsHistoryScreen.fetchReturnsReport).toHaveBeenCalledWith({});

  await userEvent.click(screen.getByRole("tab", { name: "Pendientes" }));

  await expect
    .element(screen.getByRole("tab", { name: "Pendientes", selected: true }))
    .toBeVisible();
  expect(location()).toBe("/refunds");
});

test("keeps the returns history's filters in the address", async () => {
  const services = refundsServices(["returns_report"]);
  window.history.pushState(null, "", "/refunds/history");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect
    .element(
      screen
        .getByRole("table", { name: "Devoluciones iniciadas con el número tipeado" })
        .getByText("Beto"),
    )
    .toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Caja principal" }));

  await expect
    .poll(() => window.location.search)
    .toBe("?register=11111111-1111-4111-8111-111111111111");
});

test("shows only Historial to a person with returns_report alone, and sends /refunds to it", async () => {
  const services = refundsServices(["returns_report"]);
  window.history.pushState(null, "", "/refunds");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("tab", { name: "Historial", selected: true }))
    .toBeVisible();
  expect(screen.getByRole("tab", { name: "Pendientes" }).query()).toBeNull();
  expect(location()).toBe("/refunds/history");
  expect(services.pendingRefundsScreen.fetchPendingRefunds).not.toHaveBeenCalled();
});

test("shows only Pendientes to a person with refunds_area alone, and sends /refunds/history to it", async () => {
  const services = refundsServices(["refunds_area"]);
  window.history.pushState(null, "", "/refunds/history");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("tab", { name: "Pendientes", selected: true }))
    .toBeVisible();
  expect(screen.getByRole("tab", { name: "Historial" }).query()).toBeNull();
  expect(location()).toBe("/refunds");
  expect(services.returnsHistoryScreen.fetchReturnsReport).not.toHaveBeenCalled();
});

test.each(["/refunds", "/refunds/history"])(
  "sends a person with neither capability who opens %s to the own account panel",
  async (path) => {
    const services = refundsServices(["fiscal_configuration_area"]);
    window.history.pushState(null, "", path);

    const screen = await render(<App help={emptyHelp} services={services} />);

    await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
    expect(services.pendingRefundsScreen.fetchPendingRefunds).not.toHaveBeenCalled();
    expect(services.returnsHistoryScreen.fetchReturnsReport).not.toHaveBeenCalled();
  },
);

test("hides the Ventas y caja item from a person with neither capability", async () => {
  const services = refundsServices(["stock_area"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Ventas y caja", exact: true }).query()).toBeNull();
});

test("takes a person with returns_report alone to the returns history from the rail", async () => {
  const services = refundsServices(["returns_report"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("link", { name: "Ventas y caja", exact: true }));

  await expect
    .element(screen.getByRole("tab", { name: "Historial", selected: true }))
    .toBeVisible();
  expect(location()).toBe("/refunds/history");
});

test("does not offer Fiscal in the rail to a person with refunds_area alone", async () => {
  const services = refundsServices(["refunds_area"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("link", { name: "Ventas y caja", exact: true }))
    .toBeVisible();
  expect(screen.getByRole("link", { name: "Fiscal", exact: true }).query()).toBeNull();
});

test("offers both Ventas y caja and Fiscal in the rail to a person who sees refunds and fiscal screens", async () => {
  const services = refundsServices(["fiscal_configuration_area", "refunds_area"]);
  window.history.pushState(null, "", "/fiscal/caea");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Puntos de venta" })).toBeVisible();
  await expect
    .element(screen.getByRole("link", { name: "Ventas y caja", exact: true }))
    .toBeVisible();
  expect(screen.getByRole("link", { name: "Reembolsos de MP" }).query()).toBeNull();
});

test("sends a person with refunds_area alone who opens the points of sale to the own account panel", async () => {
  const services = refundsServices(["refunds_area"]);
  window.history.pushState(null, "", "/fiscal/caea");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
});

test("redirects /refunds/mercado-pago to /refunds with the channel Mercado Pago and the register kept", async () => {
  const services = refundsServices(["refunds_area"]);
  window.history.pushState(null, "", `/refunds/mercado-pago?register=${FRONT_REGISTER_ID}`);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByText("$ 1.250,00", { exact: true })).toBeVisible();
  expect(screen.getByText("$ 2.500,00", { exact: true }).query()).toBeNull();
  expect(location()).toBe(`/refunds?channel=mercado-pago&register=${FRONT_REGISTER_ID}`);
});

test("redirects /refunds/outside-the-system to /refunds with the channel Fuera de Mercado Pago, the register and the method kept", async () => {
  const services = refundsServices(["refunds_area"]);
  window.history.pushState(
    null,
    "",
    `/refunds/outside-the-system?register=${BACK_REGISTER_ID}&method=TRANSFER`,
  );

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByText("$ 980,00", { exact: true })).toBeVisible();
  expect(screen.getByText("$ 2.500,00", { exact: true }).query()).toBeNull();
  expect(location()).toBe(
    `/refunds?channel=outside-mercado-pago&method=TRANSFER&register=${BACK_REGISTER_ID}`,
  );
});

test("redirects /reports/returns to /refunds/history keeping the period and the register", async () => {
  const services = refundsServices(["returns_report"]);
  window.history.pushState(
    null,
    "",
    "/reports/returns?from=2026-10-01&to=2026-10-07&register=11111111-1111-4111-8111-111111111111",
  );

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("tab", { name: "Historial", selected: true }))
    .toBeVisible();
  expect(location()).toBe(
    "/refunds/history?from=2026-10-01&register=11111111-1111-4111-8111-111111111111&to=2026-10-07",
  );
});

test("opens the channel Fuera de Mercado Pago from the old without-api address and writes the new value", async () => {
  const services = refundsServices(["refunds_area"]);
  window.history.pushState(null, "", "/refunds?channel=without-api");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByText("$ 2.500,00", { exact: true })).toBeVisible();
  expect(screen.getByText("$ 1.250,00", { exact: true }).query()).toBeNull();
  await expect.poll(location).toBe("/refunds?channel=outside-mercado-pago");
});

test.each(["/refunds?channel=all", "/refunds?channel=unknown"])(
  "writes %s without the channel, which lists both channels",
  async (url) => {
    const services = refundsServices(["refunds_area"]);
    window.history.pushState(null, "", url);

    const screen = await render(<App help={emptyHelp} services={services} />);

    await expect.element(screen.getByText("$ 3.400,00", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 2.500,00", { exact: true })).toBeVisible();
    await expect.poll(location).toBe("/refunds");
  },
);

test("keeps the channel chosen in the address", async () => {
  const services = refundsServices(["refunds_area"]);
  window.history.pushState(null, "", "/refunds");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByText("$ 3.400,00", { exact: true })).toBeVisible();

  await screen.getByRole("button", { name: /^Canal/ }).click();
  await userEvent.click(screen.getByRole("option", { name: "Fuera de Mercado Pago" }));

  await expect.poll(location).toBe("/refunds?channel=outside-mercado-pago");
  await expect.poll(() => screen.getByText("$ 3.400,00", { exact: true }).query()).toBeNull();
  await expect.element(screen.getByText("$ 2.500,00", { exact: true })).toBeVisible();
});

test("keeps the register chosen in the address", async () => {
  const services = refundsServices(["refunds_area"]);
  window.history.pushState(null, "", "/refunds");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByText("$ 3.400,00", { exact: true })).toBeVisible();

  await screen.getByRole("combobox", { name: /^Caja/ }).click();
  await userEvent.click(screen.getByRole("option", { name: "Caja del frente" }));

  await expect.poll(() => window.location.search).toBe(`?register=${FRONT_REGISTER_ID}`);
  await expect.poll(() => screen.getByText("$ 3.400,00", { exact: true }).query()).toBeNull();
  await expect.element(screen.getByText("$ 1.250,00", { exact: true })).toBeVisible();
});

test("shows the days a good-condition exchange is open on both tabs, with Cambiar for who can change the branch", async () => {
  const services = refundsServices(["refunds_area", "returns_report", "branch_area"]);
  window.history.pushState(null, "", "/refunds");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByText("Cambio en buen estado: 15 días")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Cambiar" })).toBeVisible();
  await userEvent.click(screen.getByRole("tab", { name: "Historial" }));
  await expect.element(screen.getByText("Cambio en buen estado: 15 días")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Cambiar" })).toBeVisible();
});

test("shows the days without Cambiar to who cannot change the branch", async () => {
  const services = refundsServices(["returns_report"]);
  window.history.pushState(null, "", "/refunds/history");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByText("Cambio en buen estado: 15 días")).toBeVisible();
  expect(screen.getByRole("button", { name: "Cambiar" }).query()).toBeNull();
});

test("shows the new days, answered by the cloud, once they are saved", async () => {
  const services = refundsServices(["refunds_area", "branch_area"]);
  services.refundsBranchTerm = createBranchTermServices({
    fetchGoodConditionReturnDays: vi
      .fn()
      .mockResolvedValueOnce({ kind: "ok", value: 15 })
      .mockResolvedValue({ kind: "ok", value: 20 }),
  });
  window.history.pushState(null, "", "/refunds");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("button", { name: "Cambiar" }));
  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("textbox", { name: "Cambio en buen estado" }))
    .toHaveValue("15");

  await userEvent.fill(dialog.getByRole("textbox", { name: "Cambio en buen estado" }), "20");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar" }));

  await expect.element(screen.getByText("Cambio en buen estado: 20 días")).toBeVisible();
  expect(services.refundsBranchTerm.saveBranchSettings).toHaveBeenCalledWith(
    expect.objectContaining({ good_condition_return_days: 20 }),
  );
});
