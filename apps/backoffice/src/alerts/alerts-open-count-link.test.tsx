import type { AlertsOverview } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { FetchAlertsOverviewOutcome } from "./alerts-api";
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

const retryName = "No se cargaron las alertas. Reintentar";

test("shows nothing once it reads that no alert is open", async () => {
  const screen = await renderLink(servicesAnswering({ kind: "ok", value: nothingOpen }));

  await expect.element(screen.getByText("Cargando…")).not.toBeInTheDocument();
  expect(screen.container.querySelector("main")?.textContent).toBe("");
});

test("holds the count's place with a loading pill while it loads", async () => {
  const screen = await renderLink({
    fetchAlertsOverview: vi.fn().mockReturnValue(new Promise(() => {})),
  });

  await expect.element(screen.getByRole("status")).toHaveTextContent("Cargando…");
  expect(screen.getByRole("link").query()).toBeNull();
});

test("shows nothing, and stays on the screen, when the cloud refuses the count", async () => {
  const services = servicesAnswering({ kind: "forbidden" });
  const screen = await renderLink(services);

  await expect.poll(() => services.fetchAlertsOverview).toHaveBeenCalled();
  await expect.element(screen.getByText("Cargando…")).not.toBeInTheDocument();
  expect(screen.container.querySelector("main")?.textContent).toBe("");
  expect(window.location.pathname).toBe("/inventory");
});

test("offers to read the count again when it cannot be read, from its loading pill", async () => {
  let answerRetry: (outcome: FetchAlertsOverviewOutcome) => void = () => {};
  const fetchAlertsOverview = vi
    .fn<AlertsOpenCountLinkServices["fetchAlertsOverview"]>()
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(
      new Promise((resolve) => {
        answerRetry = resolve;
      }),
    );
  const screen = await renderLink({ fetchAlertsOverview });

  const retry = screen.getByRole("button", { name: retryName });
  await expect.element(retry).toBeVisible();
  expect(screen.getByRole("link").query()).toBeNull();
  await expectNoAccessibilityViolations(document.body);

  await userEvent.click(retry);

  await expect.element(screen.getByRole("status")).toHaveTextContent("Cargando…");
  answerRetry({ kind: "ok", value: threeOpen });
  await expect.element(screen.getByRole("link", { name: "3 alertas abiertas" })).toBeVisible();
  expect(fetchAlertsOverview).toHaveBeenCalledTimes(2);
});

test("offers to read the count again when the cloud asks to wait before reading it", async () => {
  const screen = await renderLink(
    servicesAnswering({ kind: "rate_limited", retryAfterSeconds: 30 }),
  );

  await expect.element(screen.getByRole("button", { name: retryName })).toBeVisible();
});

test("ends the session when the cloud no longer recognizes it", async () => {
  const onSessionEnded = vi.fn();
  await renderLink(servicesAnswering({ kind: "unauthenticated" }), onSessionEnded);

  await expect.poll(() => onSessionEnded).toHaveBeenCalled();
});
