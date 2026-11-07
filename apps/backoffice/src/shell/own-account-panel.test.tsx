import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { openSession } from "../sessions/test-support/open-session";
import { lucia } from "../users/test-support/user-panel";
import { App, type AppServices } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens(["/help"]);

beforeEach(resetPageState);

function servicesFor(capabilities?: Capability[]): AppServices {
  const services = createAppServices(
    capabilities === undefined
      ? {}
      : {
          fetchSession: vi
            .fn()
            .mockResolvedValue(
              openSession({ userId: "user-9", isAdministrator: false, capabilities }),
            ),
        },
  );
  vi.mocked(services.userPanel.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.ownCredentialsSection.fetchPasskeys).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  return services;
}

test("opens on the tab the URL names, offering Datos and Passkeys y PIN with users_area", async () => {
  window.history.pushState(null, "", "/help?account=credentials");

  const screen = await render(<App help={emptyHelp} services={servicesFor()} />);

  await expect
    .element(screen.getByRole("tab", { name: "Passkeys y PIN", selected: true }))
    .toBeVisible();
  await expect.element(screen.getByRole("tab", { name: "Datos", selected: false })).toBeVisible();
});

test("pressing Datos names that tab in the URL and shows the person's own data", async () => {
  window.history.pushState(null, "", "/help?account=credentials");
  const services = servicesFor();
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("tab", { name: "Datos" })).toBeVisible();

  await userEvent.click(screen.getByRole("tab", { name: "Datos" }));

  await expect.element(screen.getByRole("tab", { name: "Datos", selected: true })).toBeVisible();
  await expect.element(screen.getByText("lucia.perez@example.com")).toBeVisible();
  expect(window.location.pathname + window.location.search).toBe("/help?account=data");
});

test("opens on Passkeys y PIN, with no Datos, when the URL names Datos for a person without users_area", async () => {
  window.history.pushState(null, "", "/help?account=data");
  const services = servicesFor([]);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("tab", { name: "Passkeys y PIN", selected: true }))
    .toBeVisible();
  expect(screen.getByRole("tab", { name: "Datos" }).query()).toBeNull();
  expect(services.userPanel.fetchUser).not.toHaveBeenCalled();
});
