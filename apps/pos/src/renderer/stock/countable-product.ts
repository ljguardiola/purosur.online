import type {
  FindCountableProductOutcome,
  SearchCountableProductsOutcome,
} from "@purosur/contracts";

export type CountableProduct = Extract<FindCountableProductOutcome, { kind: "found" }>["product"];

export type CountableSearchedProduct = Extract<
  SearchCountableProductsOutcome,
  { kind: "results" }
>["products"][number];
