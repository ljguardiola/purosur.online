import { UNREACHABLE_WSFE_ENDPOINT } from "./fake-wsfe-server.js";

export const UNREACHABLE_WSAA_ENDPOINT = "http://127.0.0.1:1/ws/services/LoginCms";

export function unreachableArcaEndpoints() {
  return { wsfe: UNREACHABLE_WSFE_ENDPOINT, wsaa: UNREACHABLE_WSAA_ENDPOINT };
}
