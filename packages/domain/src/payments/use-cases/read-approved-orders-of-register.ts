import type { Clock } from "../../shared/index.js";
import { paidOrderDiscoveryStart } from "../model/paid-order-discovery.js";
import type { ApprovedOrderOfRegister, ApprovedOrdersOfRegister } from "./paid-order-ports.js";

export interface ReadApprovedOrdersOfRegisterInput {
  registerId: string;
}

export interface ReadApprovedOrdersOfRegisterPorts {
  orders: ApprovedOrdersOfRegister;
  clock: Clock;
}

export interface ReadApprovedOrdersOfRegisterOutcome {
  kind: "read";
  orders: ApprovedOrderOfRegister[];
}

export async function readApprovedOrdersOfRegister(
  { orders, clock }: ReadApprovedOrdersOfRegisterPorts,
  { registerId }: ReadApprovedOrdersOfRegisterInput,
): Promise<ReadApprovedOrdersOfRegisterOutcome> {
  return {
    kind: "read",
    orders: await orders.approvedWithoutSaleSince(registerId, paidOrderDiscoveryStart(clock.now())),
  };
}
