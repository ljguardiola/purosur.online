import {
  type ChargeSaleConfirmedByHandInput,
  type ChargeSaleConfirmedByHandOutcome,
  type ChargeSaleConfirmedByHandPorts,
  chargeSaleConfirmedByHand,
} from "./charge-sale-confirmed-by-hand.js";

export type ChargeSaleByTransferInput = ChargeSaleConfirmedByHandInput;

export type ChargeSaleByTransferPorts = ChargeSaleConfirmedByHandPorts;

export type ChargeSaleByTransferOutcome = ChargeSaleConfirmedByHandOutcome;

export function chargeSaleByTransfer(
  ports: ChargeSaleByTransferPorts,
  input: ChargeSaleByTransferInput,
): ChargeSaleByTransferOutcome {
  return chargeSaleConfirmedByHand(ports, input, "TRANSFER");
}
