import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import { AccountFooter } from "./AccountFooter";
import { signOut } from "./sessionApi";

vi.mock("./sessionApi", () => ({ signOut: vi.fn() }));

beforeEach(async () => {
  vi.mocked(signOut).mockReset().mockResolvedValue(undefined);
  await page.viewport(1280, 900);
});

// The area rail always renders this inside its own <nav> landmark, over its own
// bg-brand-blue-strong background (see Shell.tsx and AreaNavItem.test.tsx's own Rail wrapper):
// the text-blue-soft tone below is only AA-contrast against that dark background, and isolated
// rendering without it would also trip an axe "content not contained by landmarks" false positive.
function renderInRail(props: { displayName: string; onSignedOut: () => void }) {
  return render(
    <nav aria-label="Áreas" className="bg-brand-blue-strong p-2">
      <AccountFooter {...props} />
    </nav>,
  );
}

test("shows the display name and the Salir item, with no modal open yet", async () => {
  const screen = await renderInRail({ displayName: "Lucas Guardiola", onSignedOut: () => {} });

  await expect.element(screen.getByText("Lucas Guardiola")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Salir" })).toBeVisible();
  expect(screen.getByRole("dialog").query()).toBeNull();

  await expectNoAccessibilityViolations(document.body);
});

test("opens the confirm modal naming the account and asking to confirm", async () => {
  const screen = await renderInRail({ displayName: "Lucas Guardiola", onSignedOut: () => {} });

  await userEvent.click(screen.getByRole("button", { name: "Salir" }));

  const dialog = screen.getByRole("dialog");
  await expect
    .element(screen.getByRole("heading", { name: "¿Salir del backoffice?" }))
    .toBeVisible();
  await expect.element(dialog.getByText("Lucas Guardiola")).toBeVisible();
  expect(signOut).not.toHaveBeenCalled();

  await expectNoAccessibilityViolations(document.body);
});

test("cancelling the modal closes it without signing out", async () => {
  const screen = await renderInRail({ displayName: "Lucas Guardiola", onSignedOut: () => {} });

  await userEvent.click(screen.getByRole("button", { name: "Salir" }));
  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(signOut).not.toHaveBeenCalled();
});

test("confirming signs out and calls onSignedOut", async () => {
  const onSignedOut = vi.fn();
  const screen = await renderInRail({ displayName: "Lucas Guardiola", onSignedOut });

  await userEvent.click(screen.getByRole("button", { name: "Salir" }));
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Salir" }));

  await expect.poll(() => vi.mocked(signOut).mock.calls.length).toBe(1);
  await expect.poll(() => onSignedOut.mock.calls.length).toBe(1);
});
