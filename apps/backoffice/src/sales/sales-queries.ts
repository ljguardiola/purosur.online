import type {
  PendingRefundsBody,
  ReportRegisterListBody,
  SalesReportBody,
  SalesReportQuery,
} from "@purosur/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { useCloudQuery } from "../platform/use-cloud-query";
import type { fetchPendingRefunds } from "./refunds-api";
import type { fetchReportRegisters, fetchSalesReport } from "./sales-report-api";

export const salesKey = ["sales"] as const;

export const salesKeys = {
  report: (query: SalesReportQuery) =>
    [...salesKey, "report", query.from ?? "", query.to ?? "", query.register_id ?? ""] as const,
  registers: [...salesKey, "registers"] as const,
  pendingRefunds: [...salesKey, "pending-refunds"] as const,
};

type ReadParams = { onSessionEnded: () => void };

export function useSalesReportQuery(
  params: ReadParams & { query: SalesReportQuery; fetchSalesReport: typeof fetchSalesReport },
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

export function useReportRegistersQuery(
  params: ReadParams & { fetchReportRegisters: typeof fetchReportRegisters },
) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<ReportRegisterListBody>({
    queryKey: salesKeys.registers,
    read: params.fetchReportRegisters,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function usePendingRefundsQuery(
  params: ReadParams & { fetchPendingRefunds: typeof fetchPendingRefunds },
) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<PendingRefundsBody>({
    queryKey: salesKeys.pendingRefunds,
    read: params.fetchPendingRefunds,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useRefreshSales(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: salesKey });
}
