import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ReleaseMonitorContext } from "../platform/release-monitor";
import { fakeReleaseMonitor } from "../platform/test-support/release-monitor";
import { NewReleaseNotice } from "./new-release-notice";

function notice(outdated: boolean, reloadPage: () => void = () => {}) {
  return (
    <ReleaseMonitorContext value={fakeReleaseMonitor(outdated)}>
      <NewReleaseNotice reloadPage={reloadPage} />
    </ReleaseMonitorContext>
  );
}

test("shows nothing while the tab runs the deployed release", async () => {
  const screen = await render(notice(false));

  expect(screen.getByText("Hay una versión nueva del backoffice").query()).toBeNull();
  expect(screen.getByRole("button", { name: "Recargar" }).query()).toBeNull();
});

test("tells an outdated tab only that a new version is available, beside Recargar", async () => {
  const screen = await render(notice(true));

  await expect.element(screen.getByRole("button", { name: "Recargar" })).toBeVisible();
  const action = screen.getByRole("button", { name: "Recargar" }).element();
  const card = Array.from(document.body.children).find((child) => child.contains(action));
  expect(card?.querySelector("p")?.textContent).toBe("Hay una versión nueva del backoffice");
  expect(card?.querySelectorAll("p")).toHaveLength(1);
});

test("reloads the page only when the person uses Recargar", async () => {
  const reloadPage = vi.fn();
  const screen = await render(notice(true, reloadPage));
  await expect.element(screen.getByRole("button", { name: "Recargar" })).toBeVisible();
  expect(reloadPage).not.toHaveBeenCalled();

  await userEvent.click(screen.getByRole("button", { name: "Recargar" }));

  expect(reloadPage).toHaveBeenCalledTimes(1);
});
