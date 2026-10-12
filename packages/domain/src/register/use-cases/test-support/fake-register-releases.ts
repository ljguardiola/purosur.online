import type { RegisterRelease, RegisterReleases } from "../find-register-update.js";

export class FakeRegisterReleases implements RegisterReleases {
  constructor(private readonly published?: RegisterRelease) {}

  latest(): Promise<RegisterRelease | undefined> {
    return Promise.resolve(this.published);
  }
}
