import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { EndEverySessionSectionServices } from "./end-every-session-section-services";
import { renderSection } from "./test-support/end-every-session-section";

function createServices(): EndEverySessionSectionServices {
  return { endEverySession: vi.fn() };
}

test("offers to close every session in a callout for a suspected compromise", async () => {
  const screen = await renderSection(createServices());

  await expect.element(screen.getByText("Ante una sospecha de compromiso")).toBeVisible();
  await expect
    .element(
      screen.getByText(
        "Cierra todas las sesiones abiertas del backoffice, también la tuya. Cada persona vuelve a entrar con su passkey.",
      ),
    )
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Cerrar todas las sesiones" }))
    .toBeVisible();
  expect(screen.getByRole("dialog").query()).toBeNull();
  await expectNoAccessibilityViolations(screen.container);
});

test("opens the confirmation without ending any session yet", async () => {
  const services = createServices();
  const screen = await renderSection(services);

  await userEvent.click(screen.getByRole("button", { name: "Cerrar todas las sesiones" }));

  await expect
    .element(screen.getByRole("dialog", { name: "¿Cerrar todas las sesiones?" }))
    .toBeVisible();
  expect(services.endEverySession).not.toHaveBeenCalled();
});

test("closes the confirmation with Cancelar, leaving the callout", async () => {
  const screen = await renderSection(createServices());

  await userEvent.click(screen.getByRole("button", { name: "Cerrar todas las sesiones" }));
  await userEvent.click(
    screen
      .getByRole("dialog", { name: "¿Cerrar todas las sesiones?" })
      .getByRole("button", { name: "Cancelar" }),
  );

  await expect
    .poll(() => screen.getByRole("dialog", { name: "¿Cerrar todas las sesiones?" }).query())
    .toBeNull();
  await expect.element(screen.getByText("Ante una sospecha de compromiso")).toBeVisible();
});

test("reports the session as ended after the confirmation succeeds", async () => {
  const services = createServices();
  vi.mocked(services.endEverySession).mockResolvedValue({ kind: "ok" });
  const onSessionEnded = vi.fn();
  const screen = await renderSection(services, { onSessionEnded });

  await userEvent.click(screen.getByRole("button", { name: "Cerrar todas las sesiones" }));
  await userEvent.click(
    screen
      .getByRole("dialog", { name: "¿Cerrar todas las sesiones?" })
      .getByRole("button", { name: "Cerrar todas las sesiones" }),
  );

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
