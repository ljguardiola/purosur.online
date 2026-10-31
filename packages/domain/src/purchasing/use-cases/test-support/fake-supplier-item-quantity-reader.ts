import type { NetContentUnit, SaleUnit } from "../../../catalog/index.js";
import type { AiCallUsage } from "../ai-call-usage.js";
import type {
  SupplierItemQuantityReader,
  SupplierItemQuantityReading,
} from "../supplier-item-quantity-reader.js";

interface AskedItem {
  description: string;
  presentation: string | null;
  otherPresentations: string[];
}

interface AskedProduct {
  saleUnit: SaleUnit;
  netContent: { quantity: number; unit: NetContentUnit } | null;
}

export class FakeSupplierItemQuantityReader implements SupplierItemQuantityReader {
  readonly asked: { item: AskedItem; product: AskedProduct }[] = [];
  answer: SupplierItemQuantityReading | Error = { kind: "none" };
  reportedCalls: AiCallUsage[] = [];

  async read(
    item: AskedItem,
    product: AskedProduct,
    onCall: (usage: AiCallUsage) => void,
  ): Promise<SupplierItemQuantityReading> {
    this.asked.push({ item, product });
    for (const usage of this.reportedCalls) {
      onCall(usage);
    }
    if (this.answer instanceof Error) {
      throw this.answer;
    }
    return this.answer;
  }
}
