import type { AlertEmailOptInReads } from "../alert-email-opt-in-reads.js";
import type { FakeOptInUser } from "./fake-alert-email-opt-in-store.js";

export class FakeAlertEmailOptInReads implements AlertEmailOptInReads {
  private readonly users: FakeOptInUser[] = [];

  seedUser(user: FakeOptInUser): void {
    this.users.push(user);
  }

  async findAlertEmailOptIn(
    userId: string,
    locationId: string,
  ): Promise<{ optedInAt: Date | null } | undefined> {
    const found = this.users.find(
      (user) => user.id === userId && user.locationId === locationId && user.active,
    );
    return found && { optedInAt: found.alertEmailOptedInAt };
  }
}
