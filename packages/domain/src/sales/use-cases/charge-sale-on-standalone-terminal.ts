import {
  type ChargeSaleConfirmedByHandInput,
  type ChargeSaleConfirmedByHandOutcome,
  type ChargeSaleConfirmedByHandPorts,
  chargeSaleConfirmedByHand,
} from "./charge-sale-confirmed-by-hand.js";

export type ChargeSaleOnStandaloneTerminalInput = ChargeSaleConfirmedByHandInput;

export type ChargeSaleOnStandaloneTerminalPorts = ChargeSaleConfirmedByHandPorts;

export type ChargeSaleOnStandaloneTerminalOutcome = ChargeSaleConfirmedByHandOutcome;

export function chargeSaleOnStandaloneTerminal(
  ports: ChargeSaleOnStandaloneTerminalPorts,
  input: ChargeSaleOnStandaloneTerminalInput,
): ChargeSaleOnStandaloneTerminalOutcome {
  return chargeSaleConfirmedByHand(ports, input, "STANDALONE_TERMINAL");
}
