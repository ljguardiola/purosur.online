import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { createRootRouteWithContext, createRoute, RouterProvider } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { createQueryClient } from "../platform/query-client";
import { RenderFailureRecovery } from "./render-failure-recovery";
import type { RouterContext } from "./router";
import { createRegisterRouter } from "./router";

const NOTICE_TITLE = "No se pudo mostrar la pantalla";
const RETRY_LABEL = "Reintentar";
const RECOVERED_TEXT = "the screen rendered";

function buildFailingRouter(shouldThrow: () => boolean) {
  const rootRoute = createRootRouteWithContext<RouterContext>()();
  const failingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => {
      if (shouldThrow()) {
        throw new Error("screen failed to render");
      }
      return <p>{RECOVERED_TEXT}</p>;
    },
  });
  return createRegisterRouter(
    rootRoute.addChildren([failingRoute]),
    {
      queryClient: createQueryClient(),
      coreStatus: "up",
      enrollment: "enrolled",
      person: undefined,
      cashSession: { status: "none" },
      enroll: async () => ({ kind: "enrolled" }),
      registerName: async () => null,
      signInUsers: async () => [],
      authorizers: async () => [],
      lockedClosers: async () => [],
      closeCashSession: async () => ({ kind: "unavailable" }),
      closeLockedCashSession: async () => ({ kind: "unavailable" }),
      cancelLockedSale: async () => ({ kind: "unavailable" }),
      identifyLockedCloser: async () => ({ kind: "unavailable" }),
      cashBalance: async () => "unavailable",
      sessionOpenSale: async () => "unavailable",
      cashMovements: async () => "unavailable",
      cashMovementKinds: async () => "unavailable",
      recordCashMovement: async () => ({ kind: "unavailable" }),
      signIn: async () => ({ kind: "unavailable" }),
      signOut: () => {},
      openCashSession: async () => ({ kind: "unavailable" }),
      redeemPinCode: async () => ({ kind: "redeemed" }),
      signInLookup: async () => ({ kind: "unavailable" }),
      requestFirstPinCode: async () => ({ kind: "unavailable" }),
      firstSignIn: async () => ({ kind: "unavailable" }),
      currentSale: async () => null,
      cashCharge: async () => ({ kind: "invalid_amount" }),
      chargeSaleInCash: async () => ({ kind: "unavailable" }),
      chargeSaleByTransfer: async () => ({ kind: "unavailable" }),
      scanProduct: async () => ({ kind: "unavailable" }),
      searchProducts: async () => ({ kind: "unavailable" }),
      addProduct: async () => ({ kind: "unavailable" }),
      changeLineQuantity: async () => ({ kind: "unavailable" }),
      removeSaleLine: async () => ({ kind: "unavailable" }),
      cancelSale: async () => ({ kind: "unavailable" }),
      refreshCashSession: async () => {},
    },
    "/",
  );
}

function FailingRegisterHost({ shouldThrow }: { shouldThrow: () => boolean }) {
  const [router] = useState(() => buildFailingRouter(shouldThrow));
  return <RouterProvider router={router} />;
}

function ScreenThatAlwaysThrows(): ReactNode {
  throw new Error("screen failed to render");
}

describe("RenderFailureRecovery", () => {
  it("shows the screen again after automatically restarting once it stops throwing", async () => {
    let reportedFailures = 0;
    const reportFailure = vi.fn(() => {
      reportedFailures += 1;
    });
    // React silently retries a failed render once before treating it as caught, so a plain
    // per-render-call counter would flip mid-retry and hide the failure; gating on the reported
    // count instead only changes behavior once the boundary has actually caught the error.
    const shouldThrow = () => reportedFailures === 0;

    const screen = await render(
      <RenderFailureRecovery reportFailure={reportFailure}>
        <FailingRegisterHost shouldThrow={shouldThrow} />
      </RenderFailureRecovery>,
    );

    await expect.element(screen.getByText(RECOVERED_TEXT)).toBeVisible();
    expect(reportFailure).toHaveBeenCalledTimes(1);
  });

  it("shows a full-screen notice once a screen keeps throwing past the automatic restart budget", async () => {
    const reportFailure = vi.fn();

    const screen = await render(
      <RenderFailureRecovery reportFailure={reportFailure}>
        <FailingRegisterHost shouldThrow={() => true} />
      </RenderFailureRecovery>,
    );

    await expect.element(screen.getByText(NOTICE_TITLE)).toBeVisible();
    await expect.element(screen.getByRole("button", { name: RETRY_LABEL })).toBeVisible();
    expect(reportFailure).toHaveBeenCalledTimes(3);

    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows the screen again after Reintentar when it stops throwing", async () => {
    let reportedFailures = 0;
    const reportFailure = vi.fn(() => {
      reportedFailures += 1;
    });
    const shouldThrow = () => reportedFailures < 3;

    const screen = await render(
      <RenderFailureRecovery reportFailure={reportFailure}>
        <FailingRegisterHost shouldThrow={shouldThrow} />
      </RenderFailureRecovery>,
    );

    await expect.element(screen.getByText(NOTICE_TITLE)).toBeVisible();
    expect(reportFailure).toHaveBeenCalledTimes(3);

    await userEvent.click(screen.getByRole("button", { name: RETRY_LABEL }));

    await expect.element(screen.getByText(RECOVERED_TEXT)).toBeVisible();
    expect(reportFailure).toHaveBeenCalledTimes(3);
  });

  it("applies the automatic restart budget again after Reintentar before the notice returns", async () => {
    const reportFailure = vi.fn();

    const screen = await render(
      <RenderFailureRecovery reportFailure={reportFailure}>
        <FailingRegisterHost shouldThrow={() => true} />
      </RenderFailureRecovery>,
    );

    await expect.element(screen.getByText(NOTICE_TITLE)).toBeVisible();
    expect(reportFailure).toHaveBeenCalledTimes(3);

    await userEvent.click(screen.getByRole("button", { name: RETRY_LABEL }));

    await expect.poll(() => reportFailure.mock.calls.length).toBe(6);
    await expect.element(screen.getByText(NOTICE_TITLE)).toBeVisible();
  });

  it("shows the notice when the restarted screen throws again in the same render", async () => {
    const reportFailure = vi.fn();

    const screen = await render(
      <RenderFailureRecovery reportFailure={reportFailure}>
        <ScreenThatAlwaysThrows />
      </RenderFailureRecovery>,
    );

    await expect.element(screen.getByText(NOTICE_TITLE)).toBeVisible();
    expect(reportFailure).toHaveBeenCalledTimes(3);
  });

  it("does not let a caught render failure reach the window as an uncaught error", async () => {
    const onWindowError = vi.fn();
    window.addEventListener("error", onWindowError);

    try {
      const reportFailure = vi.fn();

      const screen = await render(
        <RenderFailureRecovery reportFailure={reportFailure}>
          <FailingRegisterHost shouldThrow={() => true} />
        </RenderFailureRecovery>,
      );

      await expect.element(screen.getByText(NOTICE_TITLE)).toBeVisible();
      expect(onWindowError).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("error", onWindowError);
    }
  });
});
