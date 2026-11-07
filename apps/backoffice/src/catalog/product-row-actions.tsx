import type { ListedProduct } from "@purosur/contracts";
import type { RowMenuAction, TableAction } from "@purosur/ui";
import { Ban, Boxes, Copy, Pencil, RotateCcw, Tag } from "lucide-react";
import {
  type BackofficeAccess,
  canSeePricesArea,
  canSeeStockBalances,
} from "../shell/backoffice-access";

export type ProductPanelTabRequest = "price" | "stock";

export type ProductActions = {
  edit: (product: ListedProduct) => void;
  clone: (product: ListedProduct) => void;
  deactivate: (product: ListedProduct) => void;
  reactivate: (product: ListedProduct) => void;
  openPanel: (product: ListedProduct, tab: ProductPanelTabRequest) => void;
};

const inlineActions = (actions: ProductActions) =>
  [
    (item: ListedProduct) => ({
      icon: <Pencil />,
      "aria-label": `Editar el producto ${item.name}`,
      onPress: () => actions.edit(item),
    }),
    (item: ListedProduct) => ({
      icon: <Copy />,
      "aria-label": `Clonar el producto ${item.name}`,
      onPress: () => actions.clone(item),
    }),
    (item: ListedProduct) =>
      item.active
        ? {
            icon: <Ban />,
            "aria-label": `Desactivar el producto ${item.name}`,
            onPress: () => actions.deactivate(item),
          }
        : {
            icon: <RotateCcw />,
            "aria-label": `Reactivar el producto ${item.name}`,
            onPress: () => actions.reactivate(item),
          },
  ] as const satisfies readonly TableAction<ListedProduct>[];

export function productRowActions(access: BackofficeAccess, actions: ProductActions) {
  const inline = inlineActions(actions);
  const mayChangePrice = canSeePricesArea(access);
  const maySeeStock = canSeeStockBalances(access);
  if (!mayChangePrice && !maySeeStock) {
    return { actions: inline };
  }

  function menu(item: ListedProduct) {
    const entries: RowMenuAction[] = [];
    if (mayChangePrice) {
      entries.push({
        label: "Cambiar el precio",
        icon: <Tag />,
        onAction: () => actions.openPanel(item, "price"),
      });
    }
    if (maySeeStock) {
      entries.push({
        label: "Ver stock y lotes",
        icon: <Boxes />,
        onAction: () => actions.openPanel(item, "stock"),
      });
    }
    const [first, ...others] = entries;
    return first === undefined ? undefined : ([first, ...others] as const);
  }

  return { actions: inline, menu };
}
