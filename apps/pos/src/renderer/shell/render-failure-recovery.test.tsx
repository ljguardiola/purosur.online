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
import { startupPendingGate } from "./startup-pending-gate";
import { elevatedCardOf, elevatedCardWithBadge } from "./test-support/elevated-card";
import {
  holdWindowsScrollbarWidth,
  showInStoreNotebookWindow,
  windowOverflow,
} from "./test-support/register-window";

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
      registerService: "in_service",
      restoration: { kind: "completed" },
      enrollment: "enrolled",
      person: undefined,
      cashSession: { status: "none" },
      closedCash: undefined,
      dismissClosedCash: () => {},
      enroll: async () => ({ kind: "enrolled" }),
      registerName: async () => null,
      registerVersion: async () => null,
      signInUsers: async () => ({ users: [], last_active_user_id: null }),
      authorizers: async () => [],
      lockedClosers: async () => [],
      closeCashSession: async () => ({ kind: "unavailable" }),
      closeLockedCashSession: async () => ({ kind: "unavailable" }),
      cancelLockedSale: async () => ({ kind: "unavailable" }),
      identifyLockedCloser: async () => ({ kind: "unavailable" }),
      cashBalance: async () => "unavailable",
      cashCountPreview: async () => "unavailable",
      cashMovementPreview: async () => "unavailable",
      sessionOpenSale: async () => "unavailable",
      cashMovements: async () => "unavailable",
      cashMovementKinds: async () => "unavailable",
      registerStatus: async () => ({
        conditions: [],
        cloud: "reachable",
        serial_devices: { scale: "matching", reader: "matching" },
        serial_devices_setup_offered: false,
        contingency: null,
      }),
      recordCashMovement: async () => ({ kind: "unavailable" }),
      signIn: async () => ({ kind: "unavailable" }),
      signOut: () => {},
      openCashSession: async () => ({ kind: "unavailable" }),
      openingFloatSuggestion: async () => ({ kind: "none" }),
      redeemPinCode: async () => ({ kind: "redeemed" }),
      pinPolicy: async () => ({ min_digits: 6 }),
      checkEnrollmentCode: async () => [],
      checkPinCodeRedemption: async () => [],
      signInLookup: async () => ({ kind: "unavailable" }),
      requestFirstPinCode: async () => ({ kind: "unavailable" }),
      firstSignIn: async () => ({ kind: "unavailable" }),
      currentSale: async () => null,
      cashCharge: async () => ({ kind: "invalid_amount" }),
      cashChargeAmounts: async () => null,
      nonCashCharge: async () => null,
      chargeSaleInCash: async () => ({ kind: "unavailable" }),
      chargeSaleInCashWithChangeDiscount: async () => ({ kind: "unavailable" }),
      chargeSaleByTransfer: async () => ({ kind: "unavailable" }),
      chargeSaleOnStandaloneTerminal: async () => ({ kind: "unavailable" }),
      paymentMethodAvailability: async () => null,
      startMercadoPagoCharge: async () => ({ kind: "unavailable" }),
      followMercadoPagoCharge: async () => ({ kind: "unavailable" }),
      abandonMercadoPagoCharge: async () => ({ kind: "unavailable" }),
      scanProduct: async () => ({ kind: "unavailable" }),
      searchProducts: async () => ({ kind: "unavailable" }),
      consultProduct: async () => ({ kind: "unavailable" }),
      findProductByCode: async () => ({ kind: "unavailable" }),
      addProduct: async () => ({ kind: "unavailable" }),
      changeLineQuantity: async () => ({ kind: "unavailable" }),
      addWeighedProduct: async () => ({ kind: "unavailable" }),
      weighProduct: async () => ({ kind: "scale_unavailable" }),
      readScale: async () => ({ kind: "not_configured" }),
      weighLine: async () => ({ kind: "scale_unavailable" }),
      changeLineWeight: async () => ({ kind: "unavailable" }),
      adjustSaleLine: async () => ({ kind: "unavailable" }),
      previewSaleLineAdjustment: async () => ({ kind: "unavailable" }),
      applySaleDiscount: async () => ({ kind: "no_open_sale" }),
      previewSaleDiscount: async () => ({ kind: "unavailable" }),
      removeSaleLine: async () => ({ kind: "unavailable" }),
      cancelSale: async () => ({ kind: "unavailable" }),
      cancelPaidSale: async () => ({ kind: "unavailable" }),
      voidSale: async () => ({ kind: "unavailable" }),
      receiptPrintStatus: async () => ({ kind: "unavailable" }),
      answerReceiptQuestion: async () => ({ kind: "unavailable" }),
      contingencyBackupTickets: async () => ({ kind: "unavailable" }),
      contingencyBackupTicketOfSale: async () => ({ kind: "unavailable" }),
      discardContingencyBackupTickets: async () => ({ kind: "unavailable" }),
      printOriginalReceipt: async () => ({ kind: "unavailable" }),
      findDeferredSale: async () => ({ kind: "not_found" }),
      findSaleForReturn: async () => ({ kind: "not_found" }),
      previewReturn: async () => ({ kind: "unavailable" }),
      completeReturn: async () => ({ kind: "unavailable" }),
      printDeferredSaleInvoice: async () => ({ kind: "unavailable" }),
      reprintDeferredSaleInvoice: async () => ({ kind: "unavailable" }),
      printCreditNote: async () => ({ kind: "unavailable" }),
      reprintCreditNote: async () => ({ kind: "unavailable" }),
      convertPaidOrderIntoRefund: async () => ({ kind: "unavailable" }),
      rebuildSaleAgainstPaidOrder: async () => ({ kind: "unavailable" }),
      chargeSaleWithPaidOrder: async () => ({ kind: "unavailable" }),
      reprintSaleReceipt: async () => ({ kind: "unavailable" }),
      salesHistory: async () => ({ kind: "unavailable" }),
      saleHistoryDetail: async () => ({ kind: "unavailable" }),
      readReceiptPrinter: async () => ({ kind: "not_configured" }),
      setReceiptPrinter: async () => ({ kind: "unavailable" }),
      readSerialDevices: async () => ({ kind: "unavailable" }),
      registerSerialDevices: async () => ({ kind: "unavailable" }),
      takeSerialDevicesOffer: async () => false,
      startupPending: async () => "not_permitted",
      startupPendingGate: startupPendingGate(),
      readClockGuard: async () => ({ kind: "unavailable" }),
      correctRegisterClock: async () => ({ kind: "unavailable" }),
      readInitialCount: async () => ({ kind: "unavailable" }),
      recordInitialCountLine: async () => ({ kind: "unavailable" }),
      withdrawInitialCountLine: async () => ({ kind: "unavailable" }),
      findCountableProduct: async () => ({ kind: "unavailable" }),
      searchCountableProducts: async () => ({ kind: "unavailable" }),
      weighCountedProduct: async () => ({ kind: "unavailable" }),
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

    await expect.element(screen.getByText(NOTICE_TITLE).first()).toBeVisible();
    await expect.element(screen.getByRole("button", { name: RETRY_LABEL })).toBeVisible();
    expect(reportFailure).toHaveBeenCalledTimes(3);

    await expectNoAccessibilityViolations(screen.container);
  });

  it("keeps the notice's frame within the window's width beside a vertical scrollbar", async () => {
    await showInStoreNotebookWindow();
    holdWindowsScrollbarWidth();

    const screen = await render(
      <RenderFailureRecovery reportFailure={vi.fn()}>
        <FailingRegisterHost shouldThrow={() => true} />
      </RenderFailureRecovery>,
    );

    await expect.element(screen.getByRole("button", { name: RETRY_LABEL })).toBeInTheDocument();
    expect(windowOverflow().horizontal).toBe(0);
  });

  it("shows the failure as the heading of an elevated card with an error-tone badge, with Reintentar as a button", async () => {
    const screen = await render(
      <RenderFailureRecovery reportFailure={vi.fn()}>
        <ScreenThatAlwaysThrows />
      </RenderFailureRecovery>,
    );

    const heading = screen.getByRole("heading", { level: 1, name: NOTICE_TITLE });
    await expect.element(heading).toBeVisible();
    expect(elevatedCardOf(heading.element())).toEqual(elevatedCardWithBadge("error"));
    await expect.element(screen.getByRole("button", { name: RETRY_LABEL })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("announces the failure as an alert", async () => {
    const screen = await render(
      <RenderFailureRecovery reportFailure={vi.fn()}>
        <ScreenThatAlwaysThrows />
      </RenderFailureRecovery>,
    );

    const alert = screen.getByRole("alert");
    await expect.poll(() => alert.element().textContent).toBe(NOTICE_TITLE);
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

    await expect.element(screen.getByText(NOTICE_TITLE).first()).toBeVisible();
    expect(reportFailure).toHaveBeenCalledTimes(3);

    await userEvent.click(screen.getByRole("button", { name: RETRY_LABEL }));

    await expect.element(screen.getByText(RECOVERED_TEXT)).toBeVisible();
    expect(reportFailure).toHaveBeenCalledTimes(3);
  });

  it("shows R on Reintentar", async () => {
    const screen = await render(
      <RenderFailureRecovery reportFailure={vi.fn()}>
        <ScreenThatAlwaysThrows />
      </RenderFailureRecovery>,
    );

    await expect
      .element(screen.getByRole("button", { name: RETRY_LABEL }).getByText("R", { exact: true }))
      .toBeVisible();
  });

  it("shows the screen again after pressing R when it stops throwing", async () => {
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

    await expect.element(screen.getByText(NOTICE_TITLE).first()).toBeVisible();

    await userEvent.keyboard("r");

    await expect.element(screen.getByText(RECOVERED_TEXT)).toBeVisible();
  });

  it("applies the automatic restart budget again after Reintentar before the notice returns", async () => {
    const reportFailure = vi.fn();

    const screen = await render(
      <RenderFailureRecovery reportFailure={reportFailure}>
        <FailingRegisterHost shouldThrow={() => true} />
      </RenderFailureRecovery>,
    );

    await expect.element(screen.getByText(NOTICE_TITLE).first()).toBeVisible();
    expect(reportFailure).toHaveBeenCalledTimes(3);

    await userEvent.click(screen.getByRole("button", { name: RETRY_LABEL }));

    await expect.poll(() => reportFailure.mock.calls.length).toBe(6);
    await expect.element(screen.getByText(NOTICE_TITLE).first()).toBeVisible();
  });

  it("shows the notice when the restarted screen throws again in the same render", async () => {
    const reportFailure = vi.fn();

    const screen = await render(
      <RenderFailureRecovery reportFailure={reportFailure}>
        <ScreenThatAlwaysThrows />
      </RenderFailureRecovery>,
    );

    await expect.element(screen.getByText(NOTICE_TITLE).first()).toBeVisible();
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

      await expect.element(screen.getByText(NOTICE_TITLE).first()).toBeVisible();
      expect(onWindowError).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("error", onWindowError);
    }
  });
});
