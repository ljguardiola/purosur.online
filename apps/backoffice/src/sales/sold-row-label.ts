import type { SalesByProductAndCategoryBody } from "@purosur/contracts";
import { formatProductDescription } from "@purosur/ui/formatters";
import { categoryPathText } from "../platform/category-path";

type SoldRow = SalesByProductAndCategoryBody["rows"][number];

const NO_CATEGORY = "Sin categoría";

export function soldRowLabel(row: SoldRow): string {
  return row.id === null && row.path.length === 0
    ? NO_CATEGORY
    : formatProductDescription({
        name: categoryPathText(row.path),
        brandName: row.brandName,
        netContent: row.netContent,
      });
}
