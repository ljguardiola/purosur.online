import type { ExpiringLot } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { useState } from "react";
import { vi } from "vitest";
import { type ReleaseMonitor, ReleaseMonitorContext } from "../../platform/release-monitor";
import type { BackofficeAccess } from "../../shell/backoffice-access";
import { ADMINISTRATOR_ACCESS } from "../../shell/test-support/backoffice-access";
import { createBranchTermServices } from "../../shell/test-support/branch-term";
import { render } from "../../shell/test-support/render-with-router";
import { ExpiringLotsScreen } from "../expiring-lots-screen";
import type { ExpiringLotsScreenServices } from "../expiring-lots-services";
import { type ExpiringLotsFilters, expiringLotsFilters } from "../routes";
import {
  chiaExpiredLot,
  chiaTomorrowLot,
  expiringLotList,
  oatsUpcomingLot,
  oatsYesterdayLot,
  yogurtTodayLot,
} from "./expiring-lots-fixtures";

export const EVERY_LOT: ExpiringLot[] = [
  chiaExpiredLot,
  oatsYesterdayLot,
  yogurtTodayLot,
  chiaTomorrowLot,
  oatsUpcomingLot,
];

export function createServices(): ExpiringLotsScreenServices {
  return {
    fetchExpiringLots: vi.fn(),
    fetchExpiringLotsReport: vi.fn().mockReturnValue(new Promise(() => {})),
    discardExpiredLot: vi.fn(),
    branchTerm: createBranchTermServices(),
  };
}

export function listed(lots = EVERY_LOT) {
  const services = createServices();
  vi.mocked(services.fetchExpiringLots).mockResolvedValue({
    kind: "ok",
    value: expiringLotList(lots),
  });
  return services;
}

function Harness({
  services,
  access,
  initial,
  onFiltersChange,
  onSessionEnded,
}: {
  services: ExpiringLotsScreenServices;
  access: BackofficeAccess;
  initial: ExpiringLotsFilters;
  onFiltersChange: (filters: ExpiringLotsFilters) => void;
  onSessionEnded: () => void;
}) {
  const [filters, setFilters] = useState(initial);
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <ExpiringLotsScreen
          access={access}
          services={services}
          filters={filters}
          onFiltersChange={(next) => {
            onFiltersChange(next);
            setFilters(next);
          }}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>
  );
}

export function renderScreen(
  services: ExpiringLotsScreenServices,
  {
    filters = expiringLotsFilters.parse({}),
    onFiltersChange = () => {},
    onSessionEnded = () => {},
    releaseMonitor,
    access = ADMINISTRATOR_ACCESS,
  }: {
    access?: BackofficeAccess;
    filters?: ExpiringLotsFilters;
    onFiltersChange?: (filters: ExpiringLotsFilters) => void;
    onSessionEnded?: () => void;
    releaseMonitor?: ReleaseMonitor;
  } = {},
) {
  const screen = (
    <Harness
      services={services}
      access={access}
      initial={filters}
      onFiltersChange={onFiltersChange}
      onSessionEnded={onSessionEnded}
    />
  );
  return render(
    releaseMonitor ? (
      <ReleaseMonitorContext value={releaseMonitor}>{screen}</ReleaseMonitorContext>
    ) : (
      screen
    ),
  );
}

export type Screen = Awaited<ReturnType<typeof renderScreen>>;

export function shownProductNames(screen: Screen, names: readonly string[]): string[] {
  return screen
    .getByRole("table", { name: "Vencimientos" })
    .getByRole("row")
    .elements()
    .map((row) => names.find((name) => row.textContent?.includes(name)))
    .filter((name) => name !== undefined);
}
