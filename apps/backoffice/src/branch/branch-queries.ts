import { useQueryClient } from "@tanstack/react-query";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { fetchCloudQuery, useCloudQuery } from "../platform/use-cloud-query";
import type { BranchSettings, fetchBranchSettings } from "./branch-settings-api";
import type {
  fetchGoodConditionReturnDays,
  fetchSupplierPriceListDailyCap,
} from "./branch-terms-api";

export const branchKey = ["branch"] as const;

export const branchKeys = {
  settings: [...branchKey, "settings"] as const,
  goodConditionReturnDays: [...branchKey, "good-condition-return-days"] as const,
  supplierPriceListDailyCap: [...branchKey, "supplier-price-list-daily-cap"] as const,
};

export function useBranchSettingsQuery(params: {
  fetchBranchSettings: typeof fetchBranchSettings;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<BranchSettings>({
    queryKey: branchKeys.settings,
    read: params.fetchBranchSettings,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useGoodConditionReturnDaysQuery(params: {
  fetchGoodConditionReturnDays: typeof fetchGoodConditionReturnDays;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<number>({
    queryKey: branchKeys.goodConditionReturnDays,
    read: params.fetchGoodConditionReturnDays,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useSupplierPriceListDailyCapQuery(params: {
  fetchSupplierPriceListDailyCap: typeof fetchSupplierPriceListDailyCap;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<number>({
    queryKey: branchKeys.supplierPriceListDailyCap,
    read: params.fetchSupplierPriceListDailyCap,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useReloadBranchSettings(params: {
  fetchBranchSettings: typeof fetchBranchSettings;
}): () => Promise<CloudReadOutcome<BranchSettings>> {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: branchKey });
    return fetchCloudQuery(client, {
      queryKey: branchKeys.settings,
      read: params.fetchBranchSettings,
    });
  };
}
