import { isNewerRegisterVersion, type RegisterVersion } from "../model/register-version.js";

export interface RegisterRelease {
  version: RegisterVersion;
  file: string;
  size: number;
  sha512: string;
}

export interface RegisterReleases {
  latest(): Promise<RegisterRelease | undefined>;
}

export interface FindRegisterUpdatePorts {
  releases: RegisterReleases;
}

export interface FindRegisterUpdateInput {
  installedVersion: RegisterVersion;
}

export type RegisterUpdateOutcome =
  | { kind: "up_to_date" }
  | { kind: "available"; release: RegisterRelease };

export async function findRegisterUpdate(
  { releases }: FindRegisterUpdatePorts,
  { installedVersion }: FindRegisterUpdateInput,
): Promise<RegisterUpdateOutcome> {
  const release = await releases.latest();
  if (release === undefined || !isNewerRegisterVersion(installedVersion, release.version)) {
    return { kind: "up_to_date" };
  }
  return { kind: "available", release };
}
