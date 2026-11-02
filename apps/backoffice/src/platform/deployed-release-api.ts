import { healthCheckSchema } from "@purosur/contracts";

export async function readDeployedRelease(): Promise<string | undefined> {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    if (!response.ok) {
      return undefined;
    }
    const parsed = healthCheckSchema.safeParse(await response.json());
    return parsed.success ? parsed.data.version : undefined;
  } catch {
    return undefined;
  }
}
