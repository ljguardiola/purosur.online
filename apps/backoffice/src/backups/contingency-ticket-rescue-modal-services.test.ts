import { expectTypeOf, test } from "vitest";
import type { ContingencyTicketRescueModalServices } from "./contingency-ticket-rescue-modal-services";

test("refuses rescue modal services without the recoveries read", () => {
  expectTypeOf<
    Omit<ContingencyTicketRescueModalServices, "fetchContingencyTicketRecoveries">
  >().not.toExtend<ContingencyTicketRescueModalServices>();
});

test("refuses rescue modal services without the finish recovery modal's services", () => {
  expectTypeOf<
    Omit<ContingencyTicketRescueModalServices, "finishTicketRecoveryModal">
  >().not.toExtend<ContingencyTicketRescueModalServices>();
});
