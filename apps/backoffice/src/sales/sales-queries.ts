import type { ReportQuery, ReportRegisterListBody, SalesReportBody } from "@purosur/contracts";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { useCloudQuery } from "../platform/use-cloud-query";
import type { fetchReportRegisters } from "../shell/report-registers-api";
import type { fetchSalesReport } from "./sales-report-api";

export const salesKey = ["sales"] as const;

export const salesKeys = {
  report: (query: ReportQuery) =>
    [...salesKey, "report", query.from ?? "", query.to ?? "", query.register_id ?? ""] as const,
  registers: [...salesKey, "registers"] as const,
};

type ReadParams = { onSessionEnded: () => void };

export function useSalesReportQuery(
  params: ReadParams & { query: ReportQuery; fetchSalesReport: typeof fetchSalesReport },
) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<SalesReportBody>({
    queryKey: salesKeys.report(params.query),
    keepPreviousData: true,
    read: () => params.fetchSalesReport(params.query),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useReportRegistersQuery(params: {
  fetchReportRegisters: typeof fetchReportRegisters;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<ReportRegisterListBody>({
    queryKey: salesKeys.registers,
    read: params.fetchReportRegisters,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}
