import type { Fortnight } from "../model/offline-authorization-code.js";

export interface FortnightPresentationNeedingRegularization {
  pointOfSaleNumber: number;
  registerId: string;
  fortnight: Fortnight;
}

export interface FortnightRegularizationReader {
  presentationsNeedingRegularization(): Promise<FortnightPresentationNeedingRegularization[]>;
}
