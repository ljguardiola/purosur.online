import { roundHalfUp } from "../../shared/index.js";

export interface AiTokenPrices {
  inputMicroUsdPerMillionTokens: number;
  outputMicroUsdPerMillionTokens: number;
  cacheWriteMicroUsdPerMillionTokens: number;
  cacheReadMicroUsdPerMillionTokens: number;
}

export interface AiLongPromptPrices extends AiTokenPrices {
  overPromptTokens: number;
}

export interface AiModelPrice extends AiTokenPrices {
  model: string;
  appliesFrom: Date;
  longPrompt?: AiLongPromptPrices;
}

export interface AiAttemptUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
}

const SONNET_PRICES_FROM_2026 = {
  appliesFrom: new Date("2026-01-01T00:00:00Z"),
  inputMicroUsdPerMillionTokens: 2_000_000,
  outputMicroUsdPerMillionTokens: 10_000_000,
  cacheWriteMicroUsdPerMillionTokens: 2_500_000,
  cacheReadMicroUsdPerMillionTokens: 200_000,
};

export const AI_MODEL_PRICES: readonly AiModelPrice[] = [
  { model: "claude-sonnet-5-5", ...SONNET_PRICES_FROM_2026 },
  { model: "claude-sonnet-5", ...SONNET_PRICES_FROM_2026 },
  {
    model: "claude-haiku-5-5",
    appliesFrom: new Date("2026-01-01T00:00:00Z"),
    inputMicroUsdPerMillionTokens: 100_000,
    outputMicroUsdPerMillionTokens: 500_000,
    cacheWriteMicroUsdPerMillionTokens: 125_000,
    cacheReadMicroUsdPerMillionTokens: 10_000,
    longPrompt: {
      overPromptTokens: 100_000,
      inputMicroUsdPerMillionTokens: 500_000,
      outputMicroUsdPerMillionTokens: 2_500_000,
      cacheWriteMicroUsdPerMillionTokens: 625_000,
      cacheReadMicroUsdPerMillionTokens: 50_000,
    },
  },
];

const PRICE_UNITS_PER_NANO_USD = 1_000n;

export function priceInEffect(
  table: readonly AiModelPrice[],
  model: string,
  at: Date,
): AiModelPrice | null {
  let latest: AiModelPrice | null = null;
  for (const price of table) {
    if (
      price.model === model &&
      price.appliesFrom <= at &&
      (latest === null || price.appliesFrom > latest.appliesFrom)
    ) {
      latest = price;
    }
  }
  return latest;
}

function tokenPricesFor(price: AiModelPrice, attempt: AiAttemptUsage): AiTokenPrices {
  const promptTokens = attempt.inputTokens + attempt.cacheWriteTokens + attempt.cacheReadTokens;
  return price.longPrompt !== undefined && promptTokens > price.longPrompt.overPromptTokens
    ? price.longPrompt
    : price;
}

export function aiAttemptCostNanoUsd(
  table: readonly AiModelPrice[],
  attempt: AiAttemptUsage,
  at: Date,
): number | null {
  const price = priceInEffect(table, attempt.model, at);
  if (price === null) {
    return null;
  }
  const prices = tokenPricesFor(price, attempt);
  const microUsdTimesTokens =
    BigInt(attempt.inputTokens) * BigInt(prices.inputMicroUsdPerMillionTokens) +
    BigInt(attempt.outputTokens) * BigInt(prices.outputMicroUsdPerMillionTokens) +
    BigInt(attempt.cacheWriteTokens) * BigInt(prices.cacheWriteMicroUsdPerMillionTokens) +
    BigInt(attempt.cacheReadTokens) * BigInt(prices.cacheReadMicroUsdPerMillionTokens);
  return roundHalfUp({
    numerator: microUsdTimesTokens,
    denominator: PRICE_UNITS_PER_NANO_USD,
  });
}
