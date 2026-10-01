import { useQueryClient } from "@tanstack/react-query";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { fetchCloudQuery, useCloudQuery } from "../platform/use-cloud-query";
import type {
  BuyerIdentificationThresholds,
  fetchBuyerIdentificationThresholds,
} from "./buyer-identification-threshold-api";
import type { FiscalAddress, fetchFiscalAddresses } from "./fiscal-addresses-api";
import type { fetchIssuerIdentification, IssuerIdentification } from "./issuer-identification-api";
import type { fetchRegisterPointsOfSale, RegisterPointOfSale } from "./register-points-of-sale-api";

export const fiscalKey = ["fiscal"] as const;

export const fiscalKeys = {
  issuerIdentification: [...fiscalKey, "issuer-identification"] as const,
  buyerIdentificationThresholds: [...fiscalKey, "buyer-identification-thresholds"] as const,
  fiscalAddresses: [...fiscalKey, "fiscal-addresses"] as const,
  registerPointsOfSale: [...fiscalKey, "register-points-of-sale"] as const,
};

export function useIssuerIdentificationQuery(params: {
  fetchIssuerIdentification: typeof fetchIssuerIdentification;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<IssuerIdentification>({
    queryKey: fiscalKeys.issuerIdentification,
    read: params.fetchIssuerIdentification,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useReloadIssuerIdentification(params: {
  fetchIssuerIdentification: typeof fetchIssuerIdentification;
}): () => Promise<CloudReadOutcome<IssuerIdentification>> {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: fiscalKey });
    return fetchCloudQuery(client, {
      queryKey: fiscalKeys.issuerIdentification,
      read: params.fetchIssuerIdentification,
    });
  };
}

export function useBuyerIdentificationThresholdsQuery(params: {
  fetchBuyerIdentificationThresholds: typeof fetchBuyerIdentificationThresholds;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<BuyerIdentificationThresholds>({
    queryKey: fiscalKeys.buyerIdentificationThresholds,
    read: params.fetchBuyerIdentificationThresholds,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useReloadBuyerIdentificationThresholds(params: {
  fetchBuyerIdentificationThresholds: typeof fetchBuyerIdentificationThresholds;
}): () => Promise<CloudReadOutcome<BuyerIdentificationThresholds>> {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: fiscalKey });
    return fetchCloudQuery(client, {
      queryKey: fiscalKeys.buyerIdentificationThresholds,
      read: params.fetchBuyerIdentificationThresholds,
    });
  };
}

export function useFiscalAddressesQuery(params: {
  fetchFiscalAddresses: typeof fetchFiscalAddresses;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<FiscalAddress[]>({
    queryKey: fiscalKeys.fiscalAddresses,
    read: params.fetchFiscalAddresses,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useReloadFiscalAddresses(params: {
  fetchFiscalAddresses: typeof fetchFiscalAddresses;
}): () => Promise<CloudReadOutcome<FiscalAddress[]>> {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: fiscalKey });
    return fetchCloudQuery(client, {
      queryKey: fiscalKeys.fiscalAddresses,
      read: params.fetchFiscalAddresses,
    });
  };
}

export function useRegisterPointsOfSaleQuery(params: {
  fetchRegisterPointsOfSale: typeof fetchRegisterPointsOfSale;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<RegisterPointOfSale[]>({
    queryKey: fiscalKeys.registerPointsOfSale,
    read: params.fetchRegisterPointsOfSale,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useReloadRegisterPointsOfSale(params: {
  fetchRegisterPointsOfSale: typeof fetchRegisterPointsOfSale;
}): () => Promise<CloudReadOutcome<RegisterPointOfSale[]>> {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: fiscalKey });
    return fetchCloudQuery(client, {
      queryKey: fiscalKeys.registerPointsOfSale,
      read: params.fetchRegisterPointsOfSale,
    });
  };
}
