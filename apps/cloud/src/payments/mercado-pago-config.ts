interface MercadoPagoConfig {
  accessToken: string;
  externalPosId: string;
  webhookSecret: string;
}

const MERCADO_PAGO_VARIABLES = [
  ["MERCADOPAGO_ACCESS_TOKEN", "accessToken"],
  ["MERCADOPAGO_QR_EXTERNAL_POS_ID", "externalPosId"],
  ["MERCADOPAGO_WEBHOOK_SECRET", "webhookSecret"],
] as const;

type MercadoPagoEnv = {
  [Name in (typeof MERCADO_PAGO_VARIABLES)[number][0]]?: string | undefined;
};

export function resolveMercadoPagoConfig(env: MercadoPagoEnv): MercadoPagoConfig | undefined {
  const present = MERCADO_PAGO_VARIABLES.filter(([name]) => env[name]);
  if (present.length === 0) {
    return undefined;
  }
  const missing = MERCADO_PAGO_VARIABLES.find(([name]) => !env[name]);
  const [firstPresent] = present;
  if (missing && firstPresent) {
    throw new Error(`${missing[0]} must be set when ${firstPresent[0]} is set`);
  }
  return {
    accessToken: env.MERCADOPAGO_ACCESS_TOKEN ?? "",
    externalPosId: env.MERCADOPAGO_QR_EXTERNAL_POS_ID ?? "",
    webhookSecret: env.MERCADOPAGO_WEBHOOK_SECRET ?? "",
  };
}
