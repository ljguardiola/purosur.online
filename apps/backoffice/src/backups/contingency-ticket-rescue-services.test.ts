import { expectTypeOf, test } from "vitest";
import type { ContingencyTicketRescueScreenServices } from "./contingency-ticket-rescue-services";

test("refuses rescue screen services without the recoveries read", () => {
  expectTypeOf<
    Omit<ContingencyTicketRescueScreenServices, "fetchContingencyTicketRecoveries">
  >().not.toExtend<ContingencyTicketRescueScreenServices>();
});

test("refuses rescue screen services without the finish recovery modal's services", () => {
  expectTypeOf<
    Omit<ContingencyTicketRescueScreenServices, "finishTicketRecoveryModal">
  >().not.toExtend<ContingencyTicketRescueScreenServices>();
});
