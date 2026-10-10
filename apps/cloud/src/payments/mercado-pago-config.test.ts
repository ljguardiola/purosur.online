import { describe, expect, it } from "vitest";
import { resolveMercadoPagoConfig } from "./mercado-pago-config.js";

describe("resolveMercadoPagoConfig", () => {
  const ACCESS_TOKEN = "APP_USR-fictional-access-token-0001";
  const WEBHOOK_SECRET = "fictional-webhook-secret-0001";
  const COMPLETE = {
    MERCADOPAGO_ACCESS_TOKEN: ACCESS_TOKEN,
    MERCADOPAGO_QR_EXTERNAL_POS_ID: "STORE01POS01",
    MERCADOPAGO_WEBHOOK_SECRET: WEBHOOK_SECRET,
  };

  it("is the access token, the QR code's identifier and the notification signing secret when all are set", () => {
    expect(resolveMercadoPagoConfig(COMPLETE)).toEqual({
      accessToken: ACCESS_TOKEN,
      externalPosId: "STORE01POS01",
      webhookSecret: WEBHOOK_SECRET,
    });
  });

  it.each([
    ["none is set", {}],
    [
      "all are empty",
      {
        MERCADOPAGO_ACCESS_TOKEN: "",
        MERCADOPAGO_QR_EXTERNAL_POS_ID: "",
        MERCADOPAGO_WEBHOOK_SECRET: "",
      },
    ],
  ])("leaves Mercado Pago unconfigured when %s", (_name, env) => {
    expect(resolveMercadoPagoConfig(env)).toBeUndefined();
  });

  const TOKEN = "MERCADOPAGO_ACCESS_TOKEN";
  const POS_ID = "MERCADOPAGO_QR_EXTERNAL_POS_ID";
  const SECRET = "MERCADOPAGO_WEBHOOK_SECRET";

  it.each([
    [[TOKEN], `${POS_ID} must be set when ${TOKEN} is set`],
    [[POS_ID], `${TOKEN} must be set when ${POS_ID} is set`],
    [[SECRET], `${TOKEN} must be set when ${SECRET} is set`],
    [[TOKEN, POS_ID], `${SECRET} must be set when ${TOKEN} is set`],
    [[TOKEN, SECRET], `${POS_ID} must be set when ${TOKEN} is set`],
    [[POS_ID, SECRET], `${TOKEN} must be set when ${POS_ID} is set`],
  ] as const)("refuses only %j being set, naming the missing variable", (present, message) => {
    const env = Object.fromEntries(present.map((name) => [name, COMPLETE[name]]));

    expect(() => resolveMercadoPagoConfig(env)).toThrow(message);
  });

  it("names the missing variable and never a secret value", () => {
    const resolve = () =>
      resolveMercadoPagoConfig({
        MERCADOPAGO_ACCESS_TOKEN: ACCESS_TOKEN,
        MERCADOPAGO_QR_EXTERNAL_POS_ID: "STORE01POS01",
      });

    expect(resolve).not.toThrow(ACCESS_TOKEN);
  });
});
