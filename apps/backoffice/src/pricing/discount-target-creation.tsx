import type { CategorySummary, DiscountTargets, TagSummary } from "@purosur/contracts";
import type { DiscountBenefit, DiscountTargetKind } from "@purosur/domain";
import { InlineNotice } from "@purosur/ui";
import { TriangleAlert } from "lucide-react";
import type { ReactElement } from "react";
import { useState } from "react";
import type {
  CategoryCreationModal,
  CreatedProduct,
  ProductCreationModal,
} from "../platform/creation-parts";
import { NewTagModal } from "../platform/new-tag-modal";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { useStackedCreation } from "../platform/stacked-creation";
import type { createTag } from "../platform/tag-creation-api";
import { offersTarget } from "./discount-form";
import type { fetchDiscountTargets } from "./discounts-api";
import { useMarkDiscountTargetsStale, useRefreshDiscounts } from "./pricing-queries";

export type DiscountTargetCreationServices = {
  fetchDiscountTargets: typeof fetchDiscountTargets;
  createTag: typeof createTag;
};

export type DiscountTargetCreationParts = {
  productCreationModal: ProductCreationModal;
  categoryCreationModal: CategoryCreationModal;
};

const RECORD_KINDS = {
  PRODUCT: "producto",
  CATEGORY: "categoría",
  TAG: "distintivo",
} satisfies Record<DiscountTargetKind, string>;

const CREATED_RECORDS = {
  PRODUCT: "el producto",
  CATEGORY: "la categoría",
  TAG: "el distintivo",
} satisfies Record<DiscountTargetKind, string>;

function notOfferedText(kind: DiscountTargetKind, name: string): string {
  return `Se creó ${CREATED_RECORDS[kind]} «${name}», pero no puede recibir este beneficio.`;
}

function unreadText(kind: DiscountTargetKind, name: string): string {
  return `Se creó ${CREATED_RECORDS[kind]} «${name}», pero no pudimos cargarlo para elegirlo.`;
}

type Params = {
  targets: DiscountTargets;
  services: DiscountTargetCreationServices;
  parts: DiscountTargetCreationParts | undefined;
  benefitKind: () => DiscountBenefit["kind"];
  choose: (targetId: string | null) => void;
  onSessionEnded: () => void;
};

export function useDiscountTargetCreation({
  targets,
  services,
  parts,
  benefitKind,
  choose,
  onSessionEnded,
}: Params) {
  const sendToMyAccount = useSendToMyAccount();
  const [reread, setReread] = useState<DiscountTargets | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const catalog = { markStale: useMarkDiscountTargetsStale(), refresh: useRefreshDiscounts() };

  async function settle(kind: DiscountTargetKind, created: { id: string; name: string }) {
    setNotice(null);
    const outcome = await services.fetchDiscountTargets();
    if (outcome.kind === "ok") {
      setReread(outcome.value);
      if (offersTarget(kind, benefitKind(), outcome.value, created.id)) {
        choose(created.id);
        return;
      }
      choose(null);
      setNotice(notOfferedText(kind, created.name));
      return;
    }
    if (outcome.kind === "unauthenticated") {
      onSessionEnded();
      return;
    }
    if (outcome.kind === "forbidden") {
      sendToMyAccount();
      return;
    }
    choose(null);
    setNotice(unreadText(kind, created.name));
  }

  const product = useStackedCreation<CreatedProduct>(
    (created) => void settle("PRODUCT", created),
    catalog,
  );
  const category = useStackedCreation<CategorySummary>(
    (created) => void settle("CATEGORY", created),
    catalog,
  );
  const tag = useStackedCreation<TagSummary>((created) => void settle("TAG", created), catalog);
  const starts: Record<DiscountTargetKind, (typedText: string) => void> = {
    PRODUCT: product.start,
    CATEGORY: category.start,
    TAG: tag.start,
  };

  const ProductCreation = parts?.productCreationModal;
  const CategoryCreation = parts?.categoryCreationModal;
  const modals: ReactElement | null =
    ProductCreation && CategoryCreation ? (
      <>
        <ProductCreation
          open={product.open}
          initialName={product.initialName}
          onCreated={product.select}
          onClose={product.close}
          onSessionEnded={onSessionEnded}
        />
        <CategoryCreation
          open={category.open}
          initialName={category.initialName}
          onCreated={category.select}
          onClose={category.close}
          onSessionEnded={onSessionEnded}
        />
        <NewTagModal
          open={tag.open}
          initialName={tag.initialName}
          context="Catálogo · Promociones"
          services={services}
          onCreated={tag.select}
          onClose={tag.close}
          onSessionEnded={onSessionEnded}
        />
      </>
    ) : null;

  return {
    sources: reread ?? targets,
    notice,
    modals,
    creationOf: (kind: DiscountTargetKind) =>
      parts ? { creation: { recordKind: RECORD_KINDS[kind], onCreate: starts[kind] } } : {},
    reset: () => {
      product.reset();
      category.reset();
      tag.reset();
      setReread(null);
      setNotice(null);
    },
    finish: () => {
      product.finish();
      category.finish();
      tag.finish();
    },
  };
}

export function DiscountTargetCreationNotice({ text }: { text: string | null }) {
  return text === null ? null : (
    <InlineNotice tone="warning" icon={<TriangleAlert />} title={text} />
  );
}
