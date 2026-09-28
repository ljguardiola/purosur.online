import { defineHelp } from "@purosur/ui";
import { expect, test, vi } from "vitest";
import { createAppRouter } from "./app-router";
import { ScreenPending } from "./screen-pending";

test("makes the loading notice the pending component of every route", () => {
  const router = createAppRouter({
    session: { kind: "signed-out", notice: undefined },
    help: defineHelp("es-AR", { categories: {}, articles: {} }),
    services: {
      fetchSession: vi.fn(),
      checkSessionStatus: vi.fn(),
      accountFooter: { signOut: vi.fn() },
    },
    sessionActions: { signedIn: vi.fn(), signedOut: vi.fn(), sessionEnded: vi.fn() },
  });

  expect(router.options.defaultPendingComponent).toBe(ScreenPending);
});
