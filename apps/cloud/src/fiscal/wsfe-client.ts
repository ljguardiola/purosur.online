import { fileURLToPath } from "node:url";
import { type Client, createClientAsync } from "soap";

// `wsdl/` sits beside both `src/` and `dist/` and ships through package.json's `files`.
const WSFE_WSDL_PATH = fileURLToPath(new URL("../../wsdl/wsfev1.wsdl", import.meta.url));

export function createWsfeClient(endpoint: string): Promise<Client> {
  return createClientAsync(WSFE_WSDL_PATH, { endpoint });
}
