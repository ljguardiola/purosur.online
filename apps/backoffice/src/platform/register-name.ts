import type { CloudReadOutcome } from "./cloud-read-outcome";

export type RegisterName = { id: string; name: string };

export type FetchRegisterNames = () => Promise<CloudReadOutcome<RegisterName[]>>;
