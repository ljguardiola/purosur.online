import { fetchHandTypedWeights } from "./sales-report-api";

export type HandTypedWeightsScreenServices = {
  fetchHandTypedWeights: typeof fetchHandTypedWeights;
};

export const defaultHandTypedWeightsScreenServices: HandTypedWeightsScreenServices = {
  fetchHandTypedWeights,
};
