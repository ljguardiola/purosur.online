import type { InstallationKeyGenerator } from "../installation-key-generator.js";

export class SequentialInstallationKeys implements InstallationKeyGenerator {
  private generated = 0;

  generate(): string {
    this.generated += 1;
    return `key-${this.generated}`;
  }
}
