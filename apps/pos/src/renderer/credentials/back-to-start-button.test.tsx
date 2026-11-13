import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { BackToStartButton } from "./back-to-start-button";

it("offers going back to the start with the Enter key", async () => {
  const screen = await render(<BackToStartButton />);

  await expect.element(screen.getByRole("button", { name: "Volver al inicio" })).toBeVisible();
  await expect.element(screen.getByText("Enter", { exact: true })).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

it("goes back to the sign-in when pressed", async () => {
  const screen = await render(<BackToStartButton />);

  await userEvent.click(screen.getByRole("button", { name: "Volver al inicio" }));

  await vi.waitFor(() => expect(screen.router.state.location.pathname).toBe("/sign-in"));
});

it("goes back to the sign-in with Enter", async () => {
  const screen = await render(<BackToStartButton />);

  await userEvent.keyboard("{Enter}");

  await vi.waitFor(() => expect(screen.router.state.location.pathname).toBe("/sign-in"));
});
