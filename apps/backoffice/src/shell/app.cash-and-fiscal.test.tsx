import { FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { openSession } from "../sessions/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens(["/", "/account", "/fiscal-settings", "/help", "/points-of-sale"]);

beforeEach(resetPageState);

afterEach(resetPageState);

test("shows the Caja item in the rail for a user holding change_fiscal_configuration, linking to Puntos de venta", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Hopper",
        isAdministrator: false,
        capabilities: ["cash_area"],
      }),
    ),
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("link", { name: "Caja" })).toBeVisible();
});

test("hides the Caja item in the rail for a user without change_fiscal_configuration", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Caja" }).query()).toBeNull();
});

test("following the rail's Caja item opens Puntos de venta, with Caja and Puntos de venta active", async () => {
  window.history.pushState(null, "", "/help");
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Hopper",
        isAdministrator: false,
        capabilities: ["cash_area"],
      }),
    ),
  });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("link", { name: "Caja" })).toBeVisible();

  await userEvent.click(screen.getByRole("link", { name: "Caja" }));

  await expect
    .element(screen.getByRole("heading", { name: "Puntos de venta", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/points-of-sale");
  const cashItem = screen.getByRole("link", { name: "Caja" }).element() as HTMLAnchorElement;
  expect(cashItem.getAttribute("aria-current")).toBe("page");
  const sectionItem = screen
    .getByRole("link", { name: "Puntos de venta" })
    .element() as HTMLAnchorElement;
  expect(sectionItem.getAttribute("aria-current")).toBe("page");
  const otherItem = screen
    .getByRole("link", { name: "Configuración fiscal" })
    .element() as HTMLAnchorElement;
  expect(otherItem.getAttribute("aria-current")).toBeNull();
});

test("following the section's Configuración fiscal link opens it, with only that link active", async () => {
  window.history.pushState(null, "", "/points-of-sale");
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Hopper",
        isAdministrator: false,
        capabilities: ["cash_area"],
      }),
    ),
  });
  vi.mocked(services.fiscalConfigurationScreen.fetchIssuerIdentification).mockResolvedValue({
    kind: "ok",
    value: {
      legalName: null,
      grossIncomeRegistration: null,
      activityStartDate: null,
      authorizedCuit: FICTIONAL_CUIT,
      taxStatus: "Responsable Monotributo",
      version: 1,
    },
  });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("link", { name: "Configuración fiscal" })).toBeVisible();

  await userEvent.click(screen.getByRole("link", { name: "Configuración fiscal" }));

  await expect
    .element(screen.getByRole("heading", { name: "Configuración fiscal", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/fiscal-settings");
  const sectionItem = screen
    .getByRole("link", { name: "Configuración fiscal" })
    .element() as HTMLAnchorElement;
  expect(sectionItem.getAttribute("aria-current")).toBe("page");
  const otherItem = screen
    .getByRole("link", { name: "Puntos de venta" })
    .element() as HTMLAnchorElement;
  expect(otherItem.getAttribute("aria-current")).toBeNull();
});

test("lists Puntos de venta before Configuración fiscal in the FISCAL group", async () => {
  window.history.pushState(null, "", "/help");
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-1", displayName: "Ada Lovelace", isAdministrator: true }),
      ),
  });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("link", { name: "Caja" }));

  const labels = (await screen.getByRole("link").elements()).map((link) => link.textContent);
  expect(labels.indexOf("Puntos de venta")).toBeGreaterThan(-1);
  expect(labels.indexOf("Puntos de venta")).toBeLessThan(labels.indexOf("Configuración fiscal"));
});

test("redirects a non-permitted user's typed /points-of-sale to Mi cuenta, without loading it", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/points-of-sale");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/account");
  expect(services.pointsOfSaleScreen.fetchRegisterPointsOfSale).not.toHaveBeenCalled();
});

test("redirects a non-permitted user's typed /fiscal-settings to Mi cuenta, without loading it", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/fiscal-settings");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/account");
  expect(services.fiscalConfigurationScreen.fetchIssuerIdentification).not.toHaveBeenCalled();
});
