import {
  type DeviceCredentials,
  type DeviceCredentialsAnswer,
  type DeviceCredentialsRequest,
  readDeviceCredentialsAnswer,
} from "../../shared/device-credentials-messages";

export interface MainRequests {
  canStoreCredentials(): Promise<boolean>;
  storeCredentials(credentials: DeviceCredentials): Promise<boolean>;
  credentialsPresent(): Promise<boolean>;
  receive(message: unknown): boolean;
}

type PendingAnswer = (answer: DeviceCredentialsAnswer) => boolean;

export function createMainRequests(deps: {
  post: (message: DeviceCredentialsRequest) => void;
  newRequestId: () => string;
}): MainRequests {
  const pending = new Map<string, PendingAnswer>();

  function ask<T>(
    request: (requestId: string) => DeviceCredentialsRequest,
    read: (answer: DeviceCredentialsAnswer) => T | undefined,
  ): Promise<T> {
    const requestId = deps.newRequestId();
    return new Promise<T>((resolve) => {
      pending.set(requestId, (answer) => {
        const value = read(answer);
        if (value === undefined) {
          return false;
        }
        resolve(value);
        return true;
      });
      deps.post(request(requestId));
    });
  }

  return {
    canStoreCredentials() {
      return ask(
        (requestId) => ({ type: "device-credentials-storable-request", request_id: requestId }),
        (answer) => (answer.type === "device-credentials-storable" ? answer.storable : undefined),
      );
    },
    storeCredentials(credentials) {
      return ask(
        (requestId) => ({ type: "store-device-credentials", request_id: requestId, credentials }),
        (answer) => (answer.type === "device-credentials-stored" ? answer.stored : undefined),
      );
    },
    credentialsPresent() {
      return ask(
        (requestId) => ({ type: "device-credentials-request", request_id: requestId }),
        (answer) => (answer.type === "device-credentials-presence" ? answer.present : undefined),
      );
    },
    receive(message) {
      const answer = readDeviceCredentialsAnswer(message);
      if (answer === undefined) {
        return false;
      }
      if (pending.get(answer.request_id)?.(answer)) {
        pending.delete(answer.request_id);
      }
      return true;
    },
  };
}
