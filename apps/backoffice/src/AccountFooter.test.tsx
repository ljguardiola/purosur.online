import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import { AccountFooter, type AccountFooterServices } from "./AccountFooter";

function createServices(overrides: Partial<AccountFooterServices> = {}): AccountFooterServices {
  return {
    signOut: vi.fn().mockResolvedValue({ kind: "ok" }),
    ...overrides,
  };
}

beforeEach(async () => {
  await page.viewport(1280, 900);
});

// The area rail always renders this inside its own <nav> landmark, over its own
// bg-brand-blue-strong background (see Shell.tsx and AreaNavItem.test.tsx's own Rail wrapper):
// the text-blue-soft tone below is only AA-contrast against that dark background, and isolated
// rendering without it would also trip an axe "content not contained by landmarks" false positive.
function renderInRail(props: {
  displayName: string;
  onSignedOut: () => void;
  services: AccountFooterServices;
}) {
  return render(
    <nav aria-label="Áreas" className="bg-brand-blue-strong p-2">
      <AccountFooter {...props} />
    </nav>,
  );
}

test("shows the display name and the Salir item, with no modal open yet", async () => {
  const services = createServices();
  const screen = await renderInRail({
    displayName: "Lucas Guardiola",
    onSignedOut: () => {},
    services,
  });

  await expect.element(screen.getByText("Lucas Guardiola")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Salir" })).toBeVisible();
  expect(screen.getByRole("dialog").query()).toBeNull();

  await expectNoAccessibilityViolations(document.body);
});

test("shows the hand cursor on the Salir item", async () => {
  const services = createServices();
  const screen = await renderInRail({
    displayName: "Lucas Guardiola",
    onSignedOut: () => {},
    services,
  });

  const salir = screen.getByRole("button", { name: "Salir" }).element() as HTMLElement;
  expect(getComputedStyle(salir).cursor).toBe("pointer");
});

test("links the display name to the signed-in account's own Mi cuenta page", async () => {
  const services = createServices();
  const screen = await renderInRail({
    displayName: "Lucas Guardiola",
    onSignedOut: () => {},
    services,
  });

  const link = screen.getByRole("link", { name: "Lucas Guardiola" }).element() as HTMLAnchorElement;
  expect(link.getAttribute("href")).toBe("/settings/users/me");
});

test("opens the confirm modal naming the account and asking to confirm", async () => {
  const services = createServices();
  const screen = await renderInRail({
    displayName: "Lucas Guardiola",
    onSignedOut: () => {},
    services,
  });

  await userEvent.click(screen.getByRole("button", { name: "Salir" }));

  const dialog = screen.getByRole("dialog");
  await expect
    .element(screen.getByRole("heading", { name: "¿Salir del backoffice?" }))
    .toBeVisible();
  await expect.element(dialog.getByText("Lucas Guardiola")).toBeVisible();
  expect(services.signOut).not.toHaveBeenCalled();

  await expectNoAccessibilityViolations(document.body);
});

test("cancelling the modal closes it without signing out", async () => {
  const services = createServices();
  const screen = await renderInRail({
    displayName: "Lucas Guardiola",
    onSignedOut: () => {},
    services,
  });

  await userEvent.click(screen.getByRole("button", { name: "Salir" }));
  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.signOut).not.toHaveBeenCalled();
});

test("confirming signs out and calls onSignedOut", async () => {
  const services = createServices();
  const onSignedOut = vi.fn();
  const screen = await renderInRail({ displayName: "Lucas Guardiola", onSignedOut, services });

  await userEvent.click(screen.getByRole("button", { name: "Salir" }));
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Salir" }));

  await expect.poll(() => vi.mocked(services.signOut).mock.calls.length).toBe(1);
  await expect.poll(() => onSignedOut.mock.calls.length).toBe(1);
});

test("keeps the person where they are, with a notice, when the cloud never ended the session", async () => {
  const services = createServices({ signOut: vi.fn().mockResolvedValue({ kind: "failed" }) });
  const onSignedOut = vi.fn();
  const screen = await renderInRail({ displayName: "Lucas Guardiola", onSignedOut, services });

  await userEvent.click(screen.getByRole("button", { name: "Salir" }));
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Salir" }));

  await expect.element(screen.getByText("No se pudo salir")).toBeVisible();
  await expect.element(screen.getByText("Probá de nuevo.")).toBeVisible();
  expect(onSignedOut).not.toHaveBeenCalled();
  await expect.element(dialog.getByRole("button", { name: "Salir" })).not.toBeDisabled();

  await expectNoAccessibilityViolations(document.body);
});

test("keeps the person where they are, with a rate-limited notice, when signing out is rate limited", async () => {
  const services = createServices({
    signOut: vi.fn().mockResolvedValue({ kind: "rate_limited", retryAfterSeconds: 120 }),
  });
  const onSignedOut = vi.fn();
  const screen = await renderInRail({ displayName: "Lucas Guardiola", onSignedOut, services });

  await userEvent.click(screen.getByRole("button", { name: "Salir" }));
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Salir" }));

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
  expect(onSignedOut).not.toHaveBeenCalled();

  await expectNoAccessibilityViolations(document.body);
});

test("does not carry a failure notice into the next time the modal is opened", async () => {
  const services = createServices({ signOut: vi.fn().mockResolvedValue({ kind: "failed" }) });
  const screen = await renderInRail({
    displayName: "Lucas Guardiola",
    onSignedOut: () => {},
    services,
  });

  await userEvent.click(screen.getByRole("button", { name: "Salir" }));
  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Salir" }));
  await expect.element(screen.getByText("No se pudo salir")).toBeVisible();

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Salir" }));

  await expect.element(screen.getByRole("dialog")).toBeVisible();
  expect(screen.getByText("No se pudo salir").query()).toBeNull();
});
