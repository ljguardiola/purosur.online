import type { FreightSummary } from "@purosur/contracts";

export function freightMeansLabel(means: FreightSummary["means"]): string {
  return means.kind === "carrier" ? means.name : "Viaje propio · costo estimado";
}
