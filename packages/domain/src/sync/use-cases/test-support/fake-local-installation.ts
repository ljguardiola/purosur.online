import type {
  CloudInstallationCheck,
  CloudInstallationStanding,
  LocalInstallation,
} from "../sync-ports.js";

export class FakeLocalInstallation implements LocalInstallation {
  revocationsRecorded = 0;

  get revoked(): boolean {
    return this.revocationsRecorded > 0;
  }

  async recordRevoked(): Promise<void> {
    this.revocationsRecorded += 1;
  }
}

export class FakeCloudInstallationCheck implements CloudInstallationCheck<string> {
  checks = 0;
  private readonly answer: CloudInstallationStanding<string>;

  constructor(answer: CloudInstallationStanding<string>) {
    this.answer = answer;
  }

  async standing(): Promise<CloudInstallationStanding<string>> {
    this.checks += 1;
    return this.answer;
  }
}
