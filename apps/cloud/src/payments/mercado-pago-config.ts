interface MercadoPagoConfig {
  accessToken: string;
  externalPosId: string;
  webhookSecret: string;
  pointTerminalId?: string;
}

const MERCADO_PAGO_VARIABLES = [
  ["MERCADOPAGO_ACCESS_TOKEN", "accessToken"],
  ["MERCADOPAGO_QR_EXTERNAL_POS_ID", "externalPosId"],
  ["MERCADOPAGO_WEBHOOK_SECRET", "webhookSecret"],
] as const;

const POINT_TERMINAL_VARIABLE = "MERCADOPAGO_POINT_TERMINAL_ID";

type MercadoPagoEnv = {
  [Name in (typeof MERCADO_PAGO_VARIABLES)[number][0] | typeof POINT_TERMINAL_VARIABLE]?:
    | string
    | undefined;
};

export function resolveMercadoPagoConfig(env: MercadoPagoEnv): MercadoPagoConfig | undefined {
  const names: (keyof MercadoPagoEnv)[] = [
    ...MERCADO_PAGO_VARIABLES.map(([name]) => name),
    POINT_TERMINAL_VARIABLE,
  ];
  const [firstPresent] = names.filter((name) => env[name]);
  if (firstPresent === undefined) {
    return undefined;
  }
  const missing = MERCADO_PAGO_VARIABLES.find(([name]) => !env[name]);
  if (missing) {
    throw new Error(`${missing[0]} must be set when ${firstPresent} is set`);
  }
  const pointTerminalId = env[POINT_TERMINAL_VARIABLE];
  return {
    ...(pointTerminalId ? { pointTerminalId } : {}),
    accessToken: env.MERCADOPAGO_ACCESS_TOKEN ?? "",
    externalPosId: env.MERCADOPAGO_QR_EXTERNAL_POS_ID ?? "",
    webhookSecret: env.MERCADOPAGO_WEBHOOK_SECRET ?? "",
  };
}
