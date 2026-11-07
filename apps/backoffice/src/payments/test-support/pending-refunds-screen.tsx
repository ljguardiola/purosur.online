import { FieldSizeProvider } from "@purosur/ui";
import { vi } from "vitest";
import { render } from "../../shell/test-support/render-with-router";
import { PendingRefundsScreen } from "../pending-refunds-screen";
import type { PendingRefundsScreenServices } from "../pending-refunds-services";
import { type PendingRefundsFilters, pendingRefundsFilters } from "../routes";

export const FRONT_REGISTER_ID = "33333333-3333-4333-8333-333333333333";
export const MAIN_REGISTER_ID = "11111111-1111-4111-8111-111111111111";

export const allChannels = pendingRefundsFilters.parse({});
export const mercadoPagoChannel: PendingRefundsFilters = {
  ...allChannels,
  channel: "mercado-pago",
};
export const withoutApiChannel: PendingRefundsFilters = {
  ...allChannels,
  channel: "without-api",
};

export function createPendingRefundsServices(): PendingRefundsScreenServices {
  return {
    fetchPendingRefunds: vi.fn(),
    confirmRefund: vi.fn(),
    discardRefund: vi.fn(),
    recordRefundTransfer: vi.fn(),
    markRefundDone: vi.fn(),
  };
}

export type RenderPendingRefundsOptions = {
  filters?: PendingRefundsFilters;
  onFiltersChange?: (filters: PendingRefundsFilters) => void;
};

export function renderPendingRefunds(
  services: PendingRefundsScreenServices,
  onSessionEnded = () => {},
  { filters = allChannels, onFiltersChange = () => {} }: RenderPendingRefundsOptions = {},
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <PendingRefundsScreen
          services={services}
          onSessionEnded={onSessionEnded}
          filters={filters}
          onFiltersChange={onFiltersChange}
        />
      </main>
    </FieldSizeProvider>,
  );
}

export function rowTexts(screen: Awaited<ReturnType<typeof renderPendingRefunds>>) {
  return screen
    .getByRole("row")
    .all()
    .slice(1)
    .map((row) => row.element().textContent ?? "");
}
