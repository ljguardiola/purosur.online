import { Agent } from "node:https";
import { type Client, createClientAsync, HttpClient, type IExOptions, type IHeaders } from "soap";

// ARCA's production hosts offer a Diffie-Hellman group smaller than OpenSSL's default security
// level accepts; the lower level applies only to connections made through ARCA's clients.
const ARCA_HTTPS_AGENT = new Agent({ ciphers: "DEFAULT@SECLEVEL=1" });

class ArcaHttpClient extends HttpClient {
  override buildRequest(rurl: string, data: unknown, exheaders?: IHeaders, exoptions?: IExOptions) {
    return super.buildRequest(rurl, data, exheaders, {
      ...exoptions,
      httpsAgent: ARCA_HTTPS_AGENT,
    });
  }
}

export function createArcaSoapClient(wsdlPath: string, endpoint: string): Promise<Client> {
  return createClientAsync(wsdlPath, { endpoint, httpClient: new ArcaHttpClient() });
}
