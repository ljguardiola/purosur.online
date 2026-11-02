import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { createReleaseMonitor } from "../platform/release-monitor";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens(["/", "/account-recovery", "/alerts"]);

beforeEach(resetPageState);

function servicesRunning(running: string, deployed: string | undefined) {
  return createAppServices({
    releaseMonitor: createReleaseMonitor({
      running,
      readDeployedRelease: vi.fn().mockResolvedValue(deployed),
    }),
  });
}

test("tells a signed-in tab that a newer release is deployed, with an action to reload", async () => {
  const screen = await render(<App help={emptyHelp} services={servicesRunning("aaa", "bbb")} />);

  await expect
    .element(screen.getByText("Hay una versión nueva del backoffice").first())
    .toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Recargar" })).toBeVisible();
});

test("tells a signed-out tab too", async () => {
  const services = servicesRunning("aaa", "bbb");
  vi.mocked(services.fetchSession).mockResolvedValue({ kind: "unauthenticated" });
  window.history.pushState(null, "", "/account-recovery");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByText("Hay una versión nueva del backoffice").first())
    .toBeVisible();
});

test("never reloads by itself: what the person typed stays until they use Recargar", async () => {
  const services = servicesRunning("aaa", "bbb");
  vi.mocked(services.fetchSession).mockResolvedValue({ kind: "unauthenticated" });
  window.history.pushState(null, "", "/account-recovery");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.fill(screen.getByRole("textbox"), "ana@example.com");

  await expect
    .element(screen.getByText("Hay una versión nueva del backoffice").first())
    .toBeVisible();

  expect(services.screenFailure.reloadPage).not.toHaveBeenCalled();
  await expect.element(screen.getByRole("textbox")).toHaveValue("ana@example.com");
});

test("reloads the page when the person uses Recargar", async () => {
  const services = servicesRunning("aaa", "bbb");
  const screen = await render(<App help={emptyHelp} services={services} />);

  await userEvent.click(screen.getByRole("button", { name: "Recargar" }));

  expect(services.screenFailure.reloadPage).toHaveBeenCalledTimes(1);
});

test("shows no notice to a tab running the deployed release, and its failures read as before", async () => {
  window.history.pushState(null, "", "/alerts");
  const services = servicesRunning("aaa", "aaa");
  vi.mocked(services.alertsListScreen.fetchAlerts).mockResolvedValue({
    kind: "ok",
    value: { alerts: null, total: 0, pageSize: 25, openCount: 0, openCriticalCount: 0 },
  } as never);
  const screen = await render(<App help={emptyHelp} services={services} reportError={vi.fn()} />);

  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("Probá de nuevo en unos minutos.");
  expect(screen.getByText("Hay una versión nueva del backoffice").query()).toBeNull();
  expect(screen.getByRole("button", { name: "Recargar" }).query()).toBeNull();
});
