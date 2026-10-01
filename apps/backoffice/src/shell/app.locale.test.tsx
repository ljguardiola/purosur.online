import { switchBrowserLanguage } from "@purosur/ui/test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";

beforeEach(resetPageState);

afterEach(resetPageState);

test("announces the design system's screen-reader texts in Spanish whatever the browser's language", async () => {
  const services = createAppServices();
  vi.mocked(services.usersListScreen.fetchUsers).mockResolvedValue({
    kind: "ok",
    value: [
      {
        id: "user-1",
        firstName: "Lucas Guardiola",
        email: "lucas@example.com",
        version: 1,
        role: { id: "00000000-0000-4000-8000-000000000001", isAdministrator: true, name: null },
        passkeyCount: 2,
        isLastActiveAdministrator: true,
      },
    ],
  });
  window.history.pushState(null, "", "/users");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("heading", { name: "Usuarios", level: 1 })).toBeVisible();

  switchBrowserLanguage("de-DE");
  await userEvent.click(screen.getByRole("button", { name: /^Estado/ }));

  await expect
    .element(screen.getByRole("button", { name: "Descartar" }).first())
    .toBeInTheDocument();
});
