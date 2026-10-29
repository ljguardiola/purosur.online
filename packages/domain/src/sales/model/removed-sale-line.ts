import type { WeightSource } from "./weight-source.js";

interface RemovedLine {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  weightSource: WeightSource | null;
  lineTotal: number;
}

export interface RemovedSaleLine {
  saleId: string;
  sessionId: string;
  actorId: string;
  removedAt: Date;
  line: RemovedLine;
}
