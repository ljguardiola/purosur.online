import { describe, expect, it } from "vitest";
import { resolveMercadoPagoConfig } from "./mercado-pago-config.js";

describe("resolveMercadoPagoConfig", () => {
  const ACCESS_TOKEN = "APP_USR-fictional-access-token-0001";
  const WEBHOOK_SECRET = "fictional-webhook-secret-0001";
  const COMPLETE = {
    MERCADOPAGO_ACCESS_TOKEN: ACCESS_TOKEN,
    MERCADOPAGO_WEBHOOK_SECRET: WEBHOOK_SECRET,
  };

  it("is the access token and the notification signing secret when both are set", () => {
    expect(resolveMercadoPagoConfig(COMPLETE)).toEqual({
      accessToken: ACCESS_TOKEN,
      webhookSecret: WEBHOOK_SECRET,
    });
  });

  it.each([
    ["none is set", {}],
    ["all are empty", { MERCADOPAGO_ACCESS_TOKEN: "", MERCADOPAGO_WEBHOOK_SECRET: "" }],
  ])("leaves Mercado Pago unconfigured when %s", (_name, env) => {
    expect(resolveMercadoPagoConfig(env)).toBeUndefined();
  });

  const TOKEN = "MERCADOPAGO_ACCESS_TOKEN";
  const SECRET = "MERCADOPAGO_WEBHOOK_SECRET";

  it.each([
    [[TOKEN], `${SECRET} must be set when ${TOKEN} is set`],
    [[SECRET], `${TOKEN} must be set when ${SECRET} is set`],
  ] as const)("refuses only %j being set, naming the missing variable", (present, message) => {
    const env = Object.fromEntries(present.map((name) => [name, COMPLETE[name]]));

    expect(() => resolveMercadoPagoConfig(env)).toThrow(message);
  });

  it("names the missing variable and never a secret value", () => {
    const resolve = () => resolveMercadoPagoConfig({ MERCADOPAGO_ACCESS_TOKEN: ACCESS_TOKEN });

    expect(resolve).not.toThrow(ACCESS_TOKEN);
  });
});
