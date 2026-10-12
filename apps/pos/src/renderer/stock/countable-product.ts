import type { FindCountableProductOutcome } from "@purosur/contracts";

export type CountableProduct = Extract<FindCountableProductOutcome, { kind: "found" }>["product"];
