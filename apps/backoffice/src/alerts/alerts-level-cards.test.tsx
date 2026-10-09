import type { AlertsOverview } from "@purosur/contracts";
import { expect, test } from "vitest";
import { render } from "../shell/test-support/render-with-router";
import { AlertsLevelCards } from "./alerts-level-cards";

const overview: AlertsOverview = {
  critical: { openCount: 4, kinds: ["user_email_changed", "user_access_increased"] },
  warning: { openCount: 2, kinds: ["backoffice_passkey_changed"] },
  informational: { openCount: 0, kinds: [] },
};

test("shows one card per level, critical first, each with its open count and the kinds open at it", async () => {
  const screen = await render(<AlertsLevelCards overview={overview} />);

  const cards = screen.getByRole("link").elements();
  expect(cards.map((card) => card.textContent)).toEqual([
    "Alertas críticas4Acceso ampliado · Correo",
    "Advertencias2Passkey",
    "Informativas0",
  ]);
});

test("links each card to the alerts list filtered by its level", async () => {
  const screen = await render(<AlertsLevelCards overview={overview} />);

  const hrefs = screen
    .getByRole("link")
    .elements()
    .map((card) => new URL(card.getAttribute("href") ?? "", window.location.origin));
  expect(hrefs.map((href) => [href.pathname, href.searchParams.get("level")])).toEqual([
    ["/alerts", "critical"],
    ["/alerts", "warning"],
    ["/alerts", "informational"],
  ]);
});

test("names a kind this app does not know yet by the kind itself", async () => {
  const screen = await render(
    <AlertsLevelCards
      overview={{ ...overview, informational: { openCount: 1, kinds: ["register_disk_low"] } }}
    />,
  );

  await expect
    .element(screen.getByRole("link", { name: "Informativas 1 register_disk_low" }))
    .toBeVisible();
});

test("names a kind that has a fixed plain-language text by its title", async () => {
  const screen = await render(
    <AlertsLevelCards
      overview={{ ...overview, critical: { openCount: 1, kinds: ["register_silent"] } }}
    />,
  );

  await expect
    .element(screen.getByRole("link", { name: "Alertas críticas 1 La caja no está sincronizando" }))
    .toBeVisible();
});
