import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { ActionFailureNotice, useFailureText, useRetryAdvice } from "./action-failure-notice";
import { ReleaseMonitorContext } from "./release-monitor";
import { fakeReleaseMonitor, OUTDATED_TAB_ADVICE } from "./test-support/release-monitor";

function FailureText({ text }: { text: string }) {
  return <p>{useFailureText(text)}</p>;
}

function RetryAdvice() {
  return <p>{useRetryAdvice()}</p>;
}

test("an action's failure notice shows its title and tells to try again", async () => {
  const screen = await render(<ActionFailureNotice title="No se pudo guardar el cambio" />);

  await expect.element(screen.getByText("No se pudo guardar el cambio")).toBeVisible();
  await expect.element(screen.getByText("Probá de nuevo.")).toBeVisible();
});

test("an action's failure notice shows the description it is given", async () => {
  const screen = await render(
    <ActionFailureNotice title="No se pudo guardar" description="Revisá los datos." />,
  );

  await expect.element(screen.getByText("Revisá los datos.")).toBeVisible();
  expect(screen.getByText("Probá de nuevo.").query()).toBeNull();
});

test("an outdated tab's failure notice keeps its title and says to reload because the backoffice was updated", async () => {
  const screen = await render(
    <ReleaseMonitorContext value={fakeReleaseMonitor(true)}>
      <ActionFailureNotice title="No se pudo guardar el cambio" description="Revisá los datos." />
    </ReleaseMonitorContext>,
  );

  await expect.element(screen.getByText("No se pudo guardar el cambio")).toBeVisible();
  await expect.element(screen.getByText(OUTDATED_TAB_ADVICE)).toBeVisible();
  expect(screen.getByText("Revisá los datos.").query()).toBeNull();
});

test("a failure text stays as given for a tab running the deployed release", async () => {
  const screen = await render(
    <ReleaseMonitorContext value={fakeReleaseMonitor(false)}>
      <FailureText text="No se pudo generar el código interno. Probá de nuevo." />
    </ReleaseMonitorContext>,
  );

  await expect
    .element(screen.getByText("No se pudo generar el código interno. Probá de nuevo."))
    .toBeVisible();
});

test("a failure text says the backoffice was updated for an outdated tab", async () => {
  const screen = await render(
    <ReleaseMonitorContext value={fakeReleaseMonitor(true)}>
      <FailureText text="No se pudo generar el código interno. Probá de nuevo." />
    </ReleaseMonitorContext>,
  );

  await expect.element(screen.getByText(OUTDATED_TAB_ADVICE)).toBeVisible();
  expect(screen.getByText("No se pudo generar el código interno.").query()).toBeNull();
});

test("the retry advice tells a tab running the deployed release to try again", async () => {
  const screen = await render(
    <ReleaseMonitorContext value={fakeReleaseMonitor(false)}>
      <RetryAdvice />
    </ReleaseMonitorContext>,
  );

  await expect.element(screen.getByText("Probá de nuevo.")).toBeVisible();
});

test("the retry advice tells an outdated tab to reload because the backoffice was updated", async () => {
  const screen = await render(
    <ReleaseMonitorContext value={fakeReleaseMonitor(true)}>
      <RetryAdvice />
    </ReleaseMonitorContext>,
  );

  await expect.element(screen.getByText(OUTDATED_TAB_ADVICE)).toBeVisible();
  expect(screen.getByText("Probá de nuevo.").query()).toBeNull();
});
