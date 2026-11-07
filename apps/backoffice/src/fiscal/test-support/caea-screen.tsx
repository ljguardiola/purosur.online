import { FieldSizeProvider } from "@purosur/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { vi } from "vitest";
import type { BackofficeAccess } from "../../shell/backoffice-access";
import { ADMINISTRATOR_ACCESS } from "../../shell/test-support/backoffice-access";
import { render } from "../../shell/test-support/render-with-router";
import { CaeaScreen } from "../caea-screen";
import type { CaeaScreenServices } from "../caea-services";
import { type ExceptionalityFilters, exceptionalityFilters } from "../exceptionality-filters";
import { fiscalKeys } from "../fiscal-queries";
import { exceptionShareOf2026 } from "./exception-share-fixtures";

export function createServices(overrides: Partial<CaeaScreenServices> = {}): CaeaScreenServices {
  return {
    fetchRegisterPointsOfSale: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
    fetchFiscalAddresses: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
    fetchFortnightPresentations: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
    fetchOfflinePointsOfSale: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
    fetchExceptionShareYear: vi.fn().mockResolvedValue({ kind: "ok", value: exceptionShareOf2026 }),
    retireOfflinePointOfSale: vi.fn(),
    remedyRejectedDocument: vi.fn(),
    confirmRevokedInstallation: vi.fn(),
    fetchBuyerTaxStatuses: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
    fetchSessionAuthorizationOptions: vi.fn(),
    authorizeSession: vi.fn(),
    startAuthentication: vi.fn(),
    ...overrides,
  };
}

export type CaeaScreenHandlers = {
  access?: BackofficeAccess;
  filters?: ExceptionalityFilters;
  onFiltersChange?: (filters: ExceptionalityFilters) => void;
  onRescue?: () => void;
  onSessionEnded?: () => void;
};

function ControlledScreen({
  services,
  access = ADMINISTRATOR_ACCESS,
  filters: initial = exceptionalityFilters.parse({}),
  onFiltersChange = () => {},
  onRescue = () => {},
  onSessionEnded = () => {},
}: CaeaScreenHandlers & { services: CaeaScreenServices }) {
  const [filters, setFilters] = useState(initial);
  const client = useQueryClient();
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <button
          type="button"
          onClick={() => void client.invalidateQueries({ queryKey: fiscalKeys.fiscalAddresses })}
        >
          Refrescar domicilios
        </button>
        <CaeaScreen
          access={access}
          services={services}
          filters={filters}
          onFiltersChange={(next) => {
            onFiltersChange(next);
            setFilters(next);
          }}
          onRescue={onRescue}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>
  );
}

export function renderScreen(services: CaeaScreenServices, handlers: CaeaScreenHandlers = {}) {
  return render(<ControlledScreen services={services} {...handlers} />);
}
