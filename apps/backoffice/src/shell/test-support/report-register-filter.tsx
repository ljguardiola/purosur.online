import { vi } from "vitest";
import { ReportRegisterFilter } from "../../register/report-register-filter";
import type { ReportRegisterFilterServices } from "../../register/report-register-filter-services";
import { reportRegisterFieldOf } from "../report-register-field";
import { registers } from "./report-fixtures";

export type { ReportRegisterFilterServices };

export function createReportRegisterFilterServices(): ReportRegisterFilterServices {
  return { fetchReportRegisters: vi.fn().mockResolvedValue({ kind: "ok", value: registers }) };
}

export function reportRegisterFieldForTests(
  services: ReportRegisterFilterServices,
  onSessionEnded: () => void,
) {
  return reportRegisterFieldOf({ filter: ReportRegisterFilter, services, onSessionEnded });
}
