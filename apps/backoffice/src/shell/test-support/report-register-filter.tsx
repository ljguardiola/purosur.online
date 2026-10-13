import type { ReactNode } from "react";
import { vi } from "vitest";
import { ReportRegisterFilter } from "../../register/report-register-filter";
import type { ReportRegisterFilterServices } from "../../register/report-register-filter-services";
import { ReportRegisterFilterProvider } from "../report-register-filter-slot";
import { registers } from "./report-fixtures";

export type { ReportRegisterFilterServices };

export function createReportRegisterFilterServices(): ReportRegisterFilterServices {
  return { fetchReportRegisters: vi.fn().mockResolvedValue({ kind: "ok", value: registers }) };
}

export function ReportRegisterFilterForTests({
  services,
  onSessionEnded,
  children,
}: {
  services: ReportRegisterFilterServices;
  onSessionEnded: () => void;
  children: ReactNode;
}) {
  return (
    <ReportRegisterFilterProvider
      filter={ReportRegisterFilter}
      services={services}
      onSessionEnded={onSessionEnded}
    >
      {children}
    </ReportRegisterFilterProvider>
  );
}
