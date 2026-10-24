import type { PushedEvent } from "@purosur/domain";
import type { AttachedSaleEvents } from "@purosur/domain/fiscal/use-cases";
import { type ReceivePorts, receiveAttachedEvent } from "@purosur/domain/sync/use-cases";
import type { reportError } from "../platform/error-reporting.js";

export class InboxAttachedSaleEvents implements AttachedSaleEvents {
  private readonly ports: ReceivePorts;
  private readonly report: typeof reportError;

  constructor(ports: ReceivePorts, report: typeof reportError) {
    this.ports = ports;
    this.report = report;
  }

  async record(deviceId: string, event: PushedEvent): Promise<void> {
    const outcome = await receiveAttachedEvent(this.ports, { deviceId, event });
    if (outcome.kind === "misplaced" || outcome.kind === "chain_broken") {
      this.report(
        "sync: a sale event attached to a fiscal request could not be held in the inbox",
        new Error(`attached event ${outcome.kind}`),
        { context: { deviceId, eventId: event.event_id, outcome: outcome.kind } },
      );
    }
  }
}
