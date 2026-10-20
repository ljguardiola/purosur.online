interface MercadoPagoConfig {
  accessToken: string;
  webhookSecret: string;
}

const MERCADO_PAGO_VARIABLES = [
  ["MERCADOPAGO_ACCESS_TOKEN", "accessToken"],
  ["MERCADOPAGO_WEBHOOK_SECRET", "webhookSecret"],
] as const;

type MercadoPagoEnv = {
  [Name in (typeof MERCADO_PAGO_VARIABLES)[number][0]]?: string | undefined;
};

export function resolveMercadoPagoConfig(env: MercadoPagoEnv): MercadoPagoConfig | undefined {
  const present = MERCADO_PAGO_VARIABLES.find(([name]) => env[name]);
  if (present === undefined) {
    return undefined;
  }
  const [firstPresent] = present;
  const missing = MERCADO_PAGO_VARIABLES.find(([name]) => !env[name]);
  if (missing) {
    throw new Error(`${missing[0]} must be set when ${firstPresent} is set`);
  }
  return {
    accessToken: env.MERCADOPAGO_ACCESS_TOKEN ?? "",
    webhookSecret: env.MERCADOPAGO_WEBHOOK_SECRET ?? "",
  };
}
