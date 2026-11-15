import { CollapsibleSegmentedControl } from "@purosur/ui";
import { getRouteApi, Outlet, useMatchRoute, useNavigate } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { AreaTabs } from "./area-tab-row";
import { AreaTopBar } from "./area-top-bar";
import { ReadBranchTermChange } from "./branch-term-change";
import { defaultBranchTermServices } from "./branch-term-services";
import { useDocumentTitle } from "./document-title";
import type { RefundsTab } from "./refunds-tabs";
import { ScreenLayout } from "./screen-layout";

const route = getRouteApi("/signed-in/sales-and-cash-area/refunds");

const VIEW_LABELS: Record<RefundsTab, string> = { pending: "Pendientes", history: "Historial" };

const VIEW_TARGETS = { pending: "/refunds", history: "/refunds/history" } as const;

export function RefundsPage(): ReactElement {
  const { refundsTabs, salesAndCashTabs, services, session, sessionActions } =
    route.useRouteContext();
  const matchRoute = useMatchRoute();
  const navigate = useNavigate();
  useDocumentTitle("Devoluciones y reembolsos · Puro Sur");
  const selectedView: RefundsTab = matchRoute({ to: "/refunds/history" }) ? "history" : "pending";
  const [firstView, ...otherViews] = refundsTabs.map((view) => ({
    value: view,
    label: VIEW_LABELS[view],
  }));

  return (
    <ScreenLayout
      topBar={
        <AreaTopBar
          title="Ventas y caja"
          action={
            <ReadBranchTermChange
              term="goodConditionReturnDays"
              access={session}
              onSessionEnded={sessionActions.sessionEnded}
              services={services.refundsBranchTerm ?? defaultBranchTermServices}
            />
          }
        />
      }
      bodyClassName="p-0"
    >
      <AreaTabs area="Ventas y caja" tabs={salesAndCashTabs} selected="refunds">
        <div className="flex min-h-0 flex-1 flex-col">
          {firstView !== undefined && otherViews.length > 0 && (
            <div className="px-6 pt-6">
              <CollapsibleSegmentedControl<RefundsTab>
                name="refunds-view"
                label="Vista"
                options={[firstView, ...otherViews]}
                value={selectedView}
                onChange={(view) => void navigate({ to: VIEW_TARGETS[view] })}
              />
            </div>
          )}
          <Outlet />
        </div>
      </AreaTabs>
    </ScreenLayout>
  );
}
