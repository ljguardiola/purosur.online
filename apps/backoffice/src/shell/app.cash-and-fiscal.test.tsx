import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { openSession } from "../access/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";

beforeEach(resetPageState);

afterEach(resetPageState);

test("shows the Caja item in the rail for a user holding change_fiscal_configuration, linking to Configuración fiscal", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Hopper",
        isAdministrator: false,
        permissions: ["change_fiscal_configuration"],
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

test("following the rail's Caja item opens Configuración fiscal, with Caja and Configuración fiscal active", async () => {
  window.history.pushState(null, "", "/help");
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Hopper",
        isAdministrator: false,
        permissions: ["change_fiscal_configuration"],
      }),
    ),
  });
  vi.mocked(services.fiscalConfigurationScreen.fetchIssuerIdentification).mockResolvedValue({
    kind: "ok",
    value: {
      legalName: null,
      grossIncomeRegistration: null,
      activityStartDate: null,
      authorizedCuit: "27-28453196-0",
      taxStatus: "Responsable Monotributo",
      version: 1,
    },
  });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("link", { name: "Caja" })).toBeVisible();

  await userEvent.click(screen.getByRole("link", { name: "Caja" }));

  await expect
    .element(screen.getByRole("heading", { name: "Configuración fiscal", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/fiscal-settings");
  const cashItem = screen.getByRole("link", { name: "Caja" }).element() as HTMLAnchorElement;
  expect(cashItem.getAttribute("aria-current")).toBe("page");
  const sectionItem = screen
    .getByRole("link", { name: "Configuración fiscal" })
    .element() as HTMLAnchorElement;
  expect(sectionItem.getAttribute("aria-current")).toBe("page");
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
