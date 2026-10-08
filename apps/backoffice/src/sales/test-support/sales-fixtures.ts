import type { ReportRegisterListBody, SalesReportBody } from "@purosur/contracts";

export const FRONT_REGISTER_ID = "11111111-1111-4111-8111-111111111111";
export const BACK_REGISTER_ID = "22222222-2222-4222-8222-222222222222";

export const registers: ReportRegisterListBody = {
  registers: [
    { id: FRONT_REGISTER_ID, name: "Caja principal" },
    { id: BACK_REGISTER_ID, name: "Caja del fondo" },
  ],
};

export const weekReport: SalesReportBody = {
  range: { from: "2026-10-01", to: "2026-10-07" },
  days: [
    { day: "2026-10-02", sales_count: 3, total: 1_250_050 },
    { day: "2026-10-05", sales_count: 1, total: 98_000 },
  ],
  totals: { sales_count: 4, total: 1_348_050 },
};

export const todayReport: SalesReportBody = {
  range: { from: "2026-10-07", to: "2026-10-07" },
  days: [],
  totals: { sales_count: 0, total: 0 },
};
