import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import {
  exceptionShareOf2026,
  fiscalAddresses,
} from "../fiscal/test-support/exception-share-fixtures";
import { openSession } from "../sessions/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens(["/", "/help", "/exceptionality", "/fiscal-tasks", "/points-of-sale"]);

beforeEach(async () => {
  await resetPageState();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T15:00:00.000Z"));
  return () => vi.useRealTimers();
});

function servicesFor(capabilities: Capability[]) {
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
  vi.mocked(services.exceptionalityScreen.fetchFiscalAddresses).mockResolvedValue({
    kind: "ok",
    value: fiscalAddresses,
  });
  vi.mocked(services.exceptionalityScreen.fetchExceptionShareYear).mockResolvedValue({
    kind: "ok",
    value: exceptionShareOf2026,
  });
  return services;
}

test("opens the exceptionality from the FISCAL group for a user who sees fiscal information", async () => {
  const services = servicesFor(["fiscal_information"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("link", { name: "Caja" }));
  const sections = screen.getByRole("navigation", { name: "Caja y fiscal" });
  await userEvent.click(sections.getByRole("link", { name: "Excepcionalidad" }));

  await expect
    .element(screen.getByRole("heading", { name: "Excepcionalidad", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/exceptionality");
  expect(document.title).toBe("Excepcionalidad · Puro Sur");
  await expect.element(screen.getByText("Enero 2026")).toBeVisible();
  await expect
    .element(sections.getByRole("link", { name: "Excepcionalidad" }))
    .toHaveAttribute("aria-current", "page");
});

test("does not offer the exceptionality to a user who cannot see fiscal information", async () => {
  const services = servicesFor(["fiscal_configuration_area"]);
  window.history.pushState(null, "", "/points-of-sale");

  const screen = await render(<App help={emptyHelp} services={services} />);

  const sections = screen.getByRole("navigation", { name: "Caja y fiscal" });
  await expect.element(sections.getByRole("link", { name: "Puntos de venta" })).toBeVisible();
  expect(sections.getByRole("link", { name: "Excepcionalidad" }).query()).toBeNull();
});

test("sends a user who cannot see fiscal information and opens /exceptionality to Mi cuenta, without loading it", async () => {
  const services = servicesFor(["fiscal_configuration_area"]);
  window.history.pushState(null, "", "/exceptionality");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
  expect(services.exceptionalityScreen.fetchFiscalAddresses).not.toHaveBeenCalled();
  expect(services.exceptionalityScreen.fetchExceptionShareYear).not.toHaveBeenCalled();
});

test("keeps the fiscal address and the year chosen in the address, and reads that fiscal address and year", async () => {
  const services = servicesFor(["fiscal_information"]);
  window.history.pushState(
    null,
    "",
    "/exceptionality?fiscalAddress=fiscal-address-warehouse&year=2025",
  );

  await render(<App help={emptyHelp} services={services} />);

  await expect
    .poll(() => vi.mocked(services.exceptionalityScreen.fetchExceptionShareYear).mock.lastCall)
    .toEqual([{ fiscalAddressId: "fiscal-address-warehouse", year: 2025 }]);
});

test("writes a chosen fiscal address into the address and asks for no year", async () => {
  const services = servicesFor(["fiscal_information"]);
  window.history.pushState(null, "", "/exceptionality");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByText("Enero 2026")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: /Domicilio fiscal:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Depósito norte" }));

  await expect.poll(() => window.location.search).toBe("?fiscalAddress=fiscal-address-warehouse");
});

test("drops a year that is not a year from the address and asks the cloud for its current one", async () => {
  const services = servicesFor(["fiscal_information"]);
  window.history.pushState(null, "", "/exceptionality?year=abc");

  await render(<App help={emptyHelp} services={services} />);

  await expect.poll(() => window.location.search).toBe("");
  await expect
    .poll(() => vi.mocked(services.exceptionalityScreen.fetchExceptionShareYear).mock.lastCall)
    .toEqual([{ fiscalAddressId: "fiscal-address-central" }]);
});
