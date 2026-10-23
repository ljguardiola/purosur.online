import { isIP } from "node:net";
import {
  isSupplierPriceListWebPageScheme,
  type SupplierPriceListWebPageRefusal,
} from "@purosur/domain";
import { isPublicAddress } from "./public-address.js";

export type WebPageHostResolver = (
  hostname: string,
) => Promise<readonly { address: string; family: number }[]>;

export type WebPageUrlAdmission =
  | { kind: "admitted"; url: URL }
  | { kind: "refused"; reason: SupplierPriceListWebPageRefusal };

export type WebPageHostCheck =
  | { kind: "checked"; address: string; family: 4 | 6 }
  | { kind: "refused"; reason: SupplierPriceListWebPageRefusal };

export function admitWebPageUrl(raw: string): WebPageUrlAdmission {
  const url = URL.parse(raw);
  if (
    url === null ||
    !isSupplierPriceListWebPageScheme(url.protocol.slice(0, -1)) ||
    url.username !== "" ||
    url.password !== ""
  ) {
    return { kind: "refused", reason: "invalid_address" };
  }
  return { kind: "admitted", url };
}

export async function checkWebPageHost(
  url: URL,
  resolve: WebPageHostResolver,
): Promise<WebPageHostCheck> {
  const hostname = url.hostname.replace(/^\[(.*)\]$/, "$1");
  const literalFamily = isIP(hostname);
  const addresses =
    literalFamily === 4 || literalFamily === 6
      ? [{ address: hostname, family: literalFamily }]
      : await resolveHost(hostname, resolve);
  const first = addresses?.[0];
  if (first === undefined) {
    return { kind: "refused", reason: "unreachable" };
  }
  if (!addresses?.every(({ address }) => isPublicAddress(address))) {
    return { kind: "refused", reason: "address_not_public" };
  }
  return { kind: "checked", address: first.address, family: first.family === 6 ? 6 : 4 };
}

async function resolveHost(
  hostname: string,
  resolve: WebPageHostResolver,
): Promise<readonly { address: string; family: number }[] | undefined> {
  try {
    return await resolve(hostname);
  } catch {
    return undefined;
  }
}
