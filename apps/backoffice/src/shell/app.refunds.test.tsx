import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import {
  pendingRefundsOfBothKinds,
  pendingRefundsWithLatePayment,
  pendingRefundsWithLatePointPayment,
} from "../payments/test-support/refund-fixtures";
import { openSession } from "../sessions/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens([
  "/",
  "/account",
  "/help",
  "/refunds/mercado-pago",
  "/refunds/outside-the-system",
  "/points-of-sale",
]);

beforeEach(resetPageState);

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
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.refundsScreens.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: pendingRefundsWithLatePayment,
  });
  return services;
}

test("opens the Mercado Pago refunds from the rail's Caja item for a user who only confirms refunds", async () => {
  const services = refundsServices(["refunds_area"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("link", { name: "Caja" }));

  await expect
    .element(screen.getByRole("heading", { name: "Reembolsos de Mercado Pago", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/refunds/mercado-pago");
  await expect.element(screen.getByText("$ 1.250,00", { exact: true })).toBeVisible();
  expect(document.title).toBe("Reembolsos de Mercado Pago · Puro Sur");
  const sections = screen.getByRole("navigation", { name: "Caja y fiscal" });
  await expect.element(sections.getByText("TAREAS", { exact: true })).toBeVisible();
  await expect
    .element(sections.getByRole("link", { name: "Reembolsos de MP" }))
    .toHaveAttribute("aria-current", "page");
  await expect.element(sections.getByRole("link", { name: "Reembolsos sin API" })).toBeVisible();
  expect(sections.getByRole("link", { name: "Puntos de venta" }).query()).toBeNull();
  expect(sections.getByRole("link", { name: "Configuración fiscal" }).query()).toBeNull();
});

test("opens the refunds without an API from the section list for a user who only confirms refunds", async () => {
  const services = refundsServices(["refunds_area"]);
  window.history.pushState(null, "", "/refunds/mercado-pago");

  const screen = await render(<App help={emptyHelp} services={services} />);
  const sections = screen.getByRole("navigation", { name: "Caja y fiscal" });
  await userEvent.click(sections.getByRole("link", { name: "Reembolsos sin API" }));

  await expect
    .element(screen.getByRole("heading", { name: "Reembolsos sin API", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/refunds/outside-the-system");
  await expect.element(screen.getByText("$ 2.500,00", { exact: true })).toBeVisible();
  expect(document.title).toBe("Reembolsos sin API · Puro Sur");
  await expect
    .element(sections.getByRole("link", { name: "Reembolsos sin API" }))
    .toHaveAttribute("aria-current", "page");
});

test("keeps opening the points of sale from the Caja item, without offering the refunds, to a user who cannot confirm them", async () => {
  const services = refundsServices(["cash_area"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("link", { name: "Caja" }));

  await expect
    .element(screen.getByRole("heading", { name: "Puntos de venta", level: 1 }))
    .toBeVisible();
  const sections = screen.getByRole("navigation", { name: "Caja y fiscal" });
  await expect.element(sections.getByRole("link", { name: "Puntos de venta" })).toBeVisible();
  expect(sections.getByRole("link", { name: "Reembolsos de MP" }).query()).toBeNull();
  expect(sections.getByRole("link", { name: "Reembolsos sin API" }).query()).toBeNull();
});

test("offers every section of Caja to a user who holds both capabilities", async () => {
  const services = refundsServices(["cash_area", "refunds_area"]);
  window.history.pushState(null, "", "/points-of-sale");

  const screen = await render(<App help={emptyHelp} services={services} />);

  const sections = screen.getByRole("navigation", { name: "Caja y fiscal" });
  await expect.element(sections.getByRole("link", { name: "Puntos de venta" })).toBeVisible();
  await expect.element(sections.getByRole("link", { name: "Configuración fiscal" })).toBeVisible();
  await expect.element(sections.getByRole("link", { name: "Reembolsos de MP" })).toBeVisible();
  await expect.element(sections.getByRole("link", { name: "Reembolsos sin API" })).toBeVisible();
});

test("hides the Caja item for a user with neither capability", async () => {
  const services = refundsServices(["stock_area"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Caja" }).query()).toBeNull();
});

test.each(["/refunds/mercado-pago", "/refunds/outside-the-system"])(
  "sends a user who cannot confirm refunds and opens %s to Mi cuenta",
  async (path) => {
    const services = refundsServices(["cash_area"]);
    window.history.pushState(null, "", path);

    const screen = await render(<App help={emptyHelp} services={services} />);

    await expect
      .element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 }))
      .toBeVisible();
    expect(services.refundsScreens.fetchPendingRefunds).not.toHaveBeenCalled();
  },
);

test("sends a user who only confirms refunds and opens the points of sale to Mi cuenta", async () => {
  const services = refundsServices(["refunds_area"]);
  window.history.pushState(null, "", "/points-of-sale");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
});

test.each([
  {
    path: "/refunds/mercado-pago",
    chosen: "Caja del frente",
    hidden: "$ 3.400,00",
    shown: "$ 1.250,00",
    register: "33333333-3333-4333-8333-333333333333",
  },
  {
    path: "/refunds/outside-the-system",
    chosen: "Caja del fondo",
    hidden: "$ 2.500,00",
    shown: "$ 980,00",
    register: "22222222-2222-4222-8222-222222222222",
  },
])(
  "keeps the register chosen in the address of $path",
  async ({ path, chosen, hidden, shown, register }) => {
    const services = refundsServices(["refunds_area"]);
    vi.mocked(services.refundsScreens.fetchPendingRefunds).mockResolvedValue({
      kind: "ok",
      value: pendingRefundsOfBothKinds,
    });
    window.history.pushState(null, "", path);

    const screen = await render(<App help={emptyHelp} services={services} />);
    await expect.element(screen.getByText(hidden, { exact: true })).toBeVisible();
    await screen.getByRole("button", { name: /Caja/ }).click();
    await userEvent.click(screen.getByRole("option", { name: chosen }));

    await expect.poll(() => window.location.search).toBe(`?register=${register}`);
    await expect.poll(() => screen.getByText(hidden, { exact: true }).query()).toBeNull();
    await expect.element(screen.getByText(shown, { exact: true })).toBeVisible();
  },
);

test.each([
  { path: "/refunds/mercado-pago", hidden: "$ 3.400,00", shown: "$ 1.250,00" },
  { path: "/refunds/outside-the-system", hidden: "$ 2.500,00", shown: "$ 980,00" },
])("opens $path on the register the address carries", async ({ path, hidden, shown }) => {
  const services = refundsServices(["refunds_area"]);
  vi.mocked(services.refundsScreens.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: pendingRefundsOfBothKinds,
  });
  const register = path.endsWith("mercado-pago")
    ? "33333333-3333-4333-8333-333333333333"
    : "22222222-2222-4222-8222-222222222222";
  window.history.pushState(null, "", `${path}?register=${register}`);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByText(shown, { exact: true })).toBeVisible();
  expect(screen.getByText(hidden, { exact: true }).query()).toBeNull();
});

test("keeps the method chosen in the address of the refunds without an API", async () => {
  const services = refundsServices(["refunds_area"]);
  vi.mocked(services.refundsScreens.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: pendingRefundsWithLatePointPayment,
  });
  window.history.pushState(null, "", "/refunds/outside-the-system");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByText("$ 2.500,00", { exact: true })).toBeVisible();
  await screen.getByRole("button", { name: /Medio/ }).click();
  await userEvent.click(screen.getByRole("option", { name: "Point integrada" }));

  await expect.poll(() => window.location.search).toBe("?method=POINT");
  await expect.poll(() => screen.getByText("$ 2.500,00", { exact: true }).query()).toBeNull();
  await expect.element(screen.getByText("$ 760,00", { exact: true })).toBeVisible();
});
