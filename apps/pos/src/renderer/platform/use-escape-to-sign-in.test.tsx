import { expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { useEscapeToSignIn } from "./use-escape-to-sign-in";

function Probe({ enabled }: { enabled?: boolean }) {
  useEscapeToSignIn(enabled);
  return <p>Pantalla</p>;
}

it("goes back to the sign-in with Escape", async () => {
  const screen = await render(<Probe />);

  await userEvent.keyboard("{Escape}");

  await vi.waitFor(() => expect(screen.router.state.location.pathname).toBe("/sign-in"));
});

it("stays on the screen with Escape while it is turned off", async () => {
  const screen = await render(<Probe enabled={false} />);

  await userEvent.keyboard("{Escape}");

  expect(screen.router.state.location.pathname).toBe("/");
});
