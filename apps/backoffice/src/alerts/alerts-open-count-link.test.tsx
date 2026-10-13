import type { AlertsOverview } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { AlertsOpenCountLink } from "./alerts-open-count-link";
import type { AlertsOpenCountLinkServices } from "./alerts-open-count-link-services";

const threeOpen: AlertsOverview = {
  critical: { openCount: 1, kinds: ["user_access_increased"] },
  warning: { openCount: 2, kinds: ["user_email_changed"] },
  informational: { openCount: 0, kinds: [] },
};

const nothingOpen: AlertsOverview = {
  critical: { openCount: 0, kinds: [] },
  warning: { openCount: 0, kinds: [] },
  informational: { openCount: 0, kinds: [] },
};

beforeEach(() => {
  window.history.replaceState(null, "", "/inventory");
});

function servicesAnswering(
  outcome: Awaited<ReturnType<AlertsOpenCountLinkServices["fetchAlertsOverview"]>>,
): AlertsOpenCountLinkServices {
  return { fetchAlertsOverview: vi.fn().mockResolvedValue(outcome) };
}

function renderLink(services: AlertsOpenCountLinkServices, onSessionEnded = () => {}) {
  return render(
    <main>
      <AlertsOpenCountLink services={services} onSessionEnded={onSessionEnded} />
    </main>,
  );
}

test("counts the open alerts as a link that opens the alerts list", async () => {
  const screen = await renderLink(servicesAnswering({ kind: "ok", value: threeOpen }));

  const link = screen.getByRole("link", { name: "3 alertas abiertas" });
  await expect.element(link).toBeVisible();
  await expectNoAccessibilityViolations(document.body);

  await userEvent.click(link);

  await expect.poll(() => window.location.pathname).toBe("/alerts");
});

test("shows nothing while no alert is open", async () => {
  const services = servicesAnswering({ kind: "ok", value: nothingOpen });
  const screen = await renderLink(services);

  await expect.poll(() => services.fetchAlertsOverview).toHaveBeenCalled();
  await expect.poll(() => screen.container.querySelector("main")?.textContent).toBe("");
  expect(screen.getByRole("link").query()).toBeNull();
});

test("shows nothing while the count loads", async () => {
  const screen = await renderLink({
    fetchAlertsOverview: vi.fn().mockReturnValue(new Promise(() => {})),
  });

  expect(screen.container.querySelector("main")?.textContent).toBe("");
});

test("shows nothing, and stays on the screen, when the cloud refuses the count", async () => {
  const services = servicesAnswering({ kind: "forbidden" });
  const screen = await renderLink(services);

  await expect.poll(() => services.fetchAlertsOverview).toHaveBeenCalled();
  await screen.rerender(
    <main>
      <AlertsOpenCountLink services={services} onSessionEnded={() => {}} />
    </main>,
  );
  expect(screen.container.querySelector("main")?.textContent).toBe("");
  expect(window.location.pathname).toBe("/inventory");
});

test("shows nothing when the count cannot be read", async () => {
  const services = servicesAnswering({ kind: "failed" });
  const screen = await renderLink(services);

  await expect.poll(() => services.fetchAlertsOverview).toHaveBeenCalled();
  expect(screen.container.querySelector("main")?.textContent).toBe("");
});

test("ends the session when the cloud no longer recognizes it", async () => {
  const onSessionEnded = vi.fn();
  await renderLink(servicesAnswering({ kind: "unauthenticated" }), onSessionEnded);

  await expect.poll(() => onSessionEnded).toHaveBeenCalled();
});
