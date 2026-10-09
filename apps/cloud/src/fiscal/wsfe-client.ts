import { fileURLToPath } from "node:url";
import type { TaxAuthorityRejection } from "@purosur/domain/fiscal/use-cases";
import { type Client, createClientAsync } from "soap";

// `wsdl/` sits beside both `src/` and `dist/` and ships through package.json's `files`.
const WSFE_WSDL_PATH = fileURLToPath(new URL("../../wsdl/wsfev1.wsdl", import.meta.url));

export function createWsfeClient(endpoint: string): Promise<Client> {
  return createClientAsync(WSFE_WSDL_PATH, { endpoint });
}

export const FACTURA_C_VOUCHER_TYPE = 11;

export function rejectionsOf(list: unknown, element: string): TaxAuthorityRejection[] {
  const listed = (list as Record<string, unknown> | undefined)?.[element];
  const entries = Array.isArray(listed) ? listed : listed === undefined ? [] : [listed];
  return entries.flatMap((entry: { Code?: unknown; Msg?: unknown }) =>
    typeof entry?.Code === "number"
      ? [{ code: entry.Code, message: typeof entry.Msg === "string" ? entry.Msg : "" }]
      : [],
  );
}

export function codesOf(list: unknown, element: string): number[] {
  return rejectionsOf(list, element).map(({ code }) => code);
}
