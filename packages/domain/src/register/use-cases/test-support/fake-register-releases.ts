import type { RegisterRelease, RegisterReleases } from "../find-register-update.js";

export class FakeRegisterReleases implements RegisterReleases {
  private readonly published: RegisterRelease | undefined;

  constructor(published?: RegisterRelease) {
    this.published = published;
  }

  latest(): Promise<RegisterRelease | undefined> {
    return Promise.resolve(this.published);
  }
}
