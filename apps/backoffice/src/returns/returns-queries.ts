import type { ReturnsReportBody, ReturnsReportQuery } from "@purosur/contracts";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { useCloudQuery } from "../platform/use-cloud-query";
import type { fetchReturnsReport } from "./returns-report-api";

export const returnsKey = ["returns"] as const;

export const returnsKeys = {
  report: (query: ReturnsReportQuery) =>
    [...returnsKey, "report", query.from ?? "", query.to ?? "", query.register_id ?? ""] as const,
};

export function useReturnsReportQuery(params: {
  query: ReturnsReportQuery;
  fetchReturnsReport: typeof fetchReturnsReport;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<ReturnsReportBody>({
    queryKey: returnsKeys.report(params.query),
    keepPreviousData: true,
    read: () => params.fetchReturnsReport(params.query),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}
