import { describe, expect, it, vi } from "vitest";
import { printingEachCompletedSale } from "../sales/printing-completed-sales";
import { createInterruptedChargesWiring } from "./interrupted-charges-wiring";

const LEFT_PENDING = [{ paymentTransactionId: "qr-1", actorId: "u1" }];

function completingSale() {
  return {
    followed: [
      {
        paymentTransactionId: "qr-1",
        outcome: { kind: "completed" as const, sale_id: "sale-1", total: 3000 },
      },
    ],
    failures: [],
  };
}

function subject() {
  const events: string[] = [];
  const takenLeftPending = vi.fn(() => LEFT_PENDING);
  const followed: unknown[] = [];
  const wiring = createInterruptedChargesWiring({
    charging: {
      chargesLeftPending: takenLeftPending,
      followInterrupted: async (interrupted) => {
        followed.push(interrupted);
        return completingSale();
      },
    },
    printing: {
      afterEachCompletedSale: (follow) =>
        follow &&
        printingEachCompletedSale(
          {
            beforePrinting: async (saleId) => {
              events.push(`authorize ${saleId}`);
            },
            print: async (saleId) => {
              events.push(`print ${saleId}`);
            },
            syncNow: () => {
              events.push("sync");
            },
            onFailure: () => {},
          },
          follow,
        ),
    },
    reportFailure: () => {},
  });
  return { events, followed, takenLeftPending, wiring };
}

describe("the follow of the Mercado Pago charges a stopped register left pending", () => {
  it("takes the charges left pending once, when it is wired, before any follow", async () => {
    const { followed, takenLeftPending, wiring } = subject();

    expect(takenLeftPending).toHaveBeenCalledTimes(1);
    await wiring.followAtStartup();
    wiring.afterEachSync();
    await vi.waitFor(() => expect(followed).toHaveLength(2));

    expect(takenLeftPending).toHaveBeenCalledTimes(1);
    expect(followed).toEqual([LEFT_PENDING, LEFT_PENDING]);
  });

  it("authorizes, prints and then syncs a sale the startup follow completes", async () => {
    const { events, wiring } = subject();

    await wiring.followAtStartup();

    await vi.waitFor(() => expect(events).toEqual(["authorize sale-1", "print sale-1", "sync"]));
  });

  it("follows the charges left pending again after each sync", async () => {
    const { followed, wiring } = subject();

    wiring.afterEachSync();

    await vi.waitFor(() => expect(followed).toEqual([LEFT_PENDING]));
  });

  it("follows nothing when the register cannot charge with Mercado Pago", async () => {
    const wiring = createInterruptedChargesWiring({
      charging: { chargesLeftPending: undefined, followInterrupted: undefined },
      printing: { afterEachCompletedSale: (follow) => follow },
      reportFailure: () => {},
    });

    await expect(wiring.followAtStartup()).resolves.toBeUndefined();
    expect(() => wiring.afterEachSync()).not.toThrow();
  });
});
