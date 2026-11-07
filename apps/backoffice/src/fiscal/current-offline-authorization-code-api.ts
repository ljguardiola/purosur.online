import {
  type CurrentOfflineAuthorizationCode,
  currentOfflineAuthorizationCodeSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { readCloudList } from "./fiscal-api-request";

export function fetchCurrentOfflineAuthorizationCode(): Promise<
  CloudReadOutcome<CurrentOfflineAuthorizationCode>
> {
  return readCloudList(
    "/api/fiscal/current-offline-authorization-code",
    (body) => currentOfflineAuthorizationCodeSchema.safeParse(body).data,
  );
}
