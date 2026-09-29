import type { AlertDetail, AlertListPage } from "@purosur/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useSendToMyAccount } from "../access/send-to-my-account";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { useCloudQuery } from "../platform/use-cloud-query";
import type { AlertListQuery, fetchAlert, fetchAlerts } from "./alerts-api";

export const alertsKey = ["alerts"] as const;

const alertListsKey = [...alertsKey, "list"] as const;

export const alertsKeys = {
  lists: alertListsKey,
  list: (query: AlertListQuery) => [...alertListsKey, query] as const,
  detail: (id: string) => [...alertsKey, "detail", id] as const,
};

export type AlertRead = { kind: "found"; alert: AlertDetail } | { kind: "not_found" };

export function useAlertsQuery(params: {
  query: AlertListQuery;
  fetchAlerts: typeof fetchAlerts;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<AlertListPage>({
    queryKey: alertsKeys.list(params.query),
    read: () => params.fetchAlerts(params.query),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

async function readAlert(
  id: string,
  read: typeof fetchAlert,
): Promise<CloudReadOutcome<AlertRead>> {
  const outcome = await read(id);
  if (outcome.kind === "ok") {
    return { kind: "ok", value: { kind: "found", alert: outcome.value } };
  }
  if (outcome.kind === "not_found") {
    return { kind: "ok", value: { kind: "not_found" } };
  }
  return outcome;
}

export function useAlertQuery(params: {
  id: string;
  fetchAlert: typeof fetchAlert;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<AlertRead>({
    queryKey: alertsKeys.detail(params.id),
    read: () => readAlert(params.id, params.fetchAlert),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useRefreshAlerts(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: alertsKey });
}

export function useRefreshAlertsAfterClosing(): () => Promise<void> {
  const client = useQueryClient();
  // The closed alert's detail is still mounted at this point: reading it again would spend a
  // request of the backoffice's hourly rate limit on an alert that is no longer shown.
  return () => {
    void client.invalidateQueries({ queryKey: alertsKey, refetchType: "none" });
    return client.refetchQueries({ queryKey: alertsKeys.lists, type: "active" });
  };
}
