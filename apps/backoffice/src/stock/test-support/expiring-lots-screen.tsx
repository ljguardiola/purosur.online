import type { ExpiringLot } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { vi } from "vitest";
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
  return { fetchExpiringLots: vi.fn(), discardExpiredLot: vi.fn() };
}

export function listed(lots = EVERY_LOT) {
  const services = createServices();
  vi.mocked(services.fetchExpiringLots).mockResolvedValue({
    kind: "ok",
    value: expiringLotList(lots),
  });
  return services;
}

export function renderScreen(
  services: ExpiringLotsScreenServices,
  {
    filters = expiringLotsFilters.parse({}),
    onFiltersChange = () => {},
    onSessionEnded = () => {},
  }: {
    filters?: ExpiringLotsFilters;
    onFiltersChange?: (filters: ExpiringLotsFilters) => void;
    onSessionEnded?: () => void;
  } = {},
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <ExpiringLotsScreen
          services={services}
          filters={filters}
          onFiltersChange={onFiltersChange}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>,
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
