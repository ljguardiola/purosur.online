import type { RegisterStatus } from "@purosur/contracts";
import type { SectionListStatus } from "@purosur/ui";

const STANDINGS: Record<RegisterStatus["cloud"], SectionListStatus> = {
  reachable: { tone: "success", text: "Nube conectada" },
  unreachable: { tone: "error", text: "Sin conexión con la nube" },
  unknown: { tone: "neutral", text: "Nube sin verificar" },
};

export function cloudStanding(cloud: RegisterStatus["cloud"]): SectionListStatus {
  return STANDINGS[cloud];
}
