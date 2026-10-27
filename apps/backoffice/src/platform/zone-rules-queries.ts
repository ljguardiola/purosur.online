import type { ZoneRules } from "@purosur/domain";
import { useSendToMyAccount } from "./send-to-my-account";
import { useCloudQuery } from "./use-cloud-query";
import type { fetchCurrentZoneRules } from "./zone-rules-api";

export function useCurrentZoneRulesQuery(params: {
  fetchCurrentZoneRules: typeof fetchCurrentZoneRules;
  enabled?: boolean;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<ZoneRules>({
    queryKey: ["zone-rules", "current"],
    read: params.fetchCurrentZoneRules,
    enabled: params.enabled ?? true,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}
