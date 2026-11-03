import { purchaseRegistrationBodySchema } from "@purosur/contracts";
import { useNavigate } from "@tanstack/react-router";
import type { ProductCreationModal } from "../platform/creation-parts";
import type { BackofficeAccess } from "../shell/backoffice-access";
import type { NewPurchaseScreenServices } from "./new-purchase-services";
import { emptyPurchaseForm, purchaseRegistrationRequestFrom } from "./purchase-form";
import { PURCHASE_REGISTERED_STATE } from "./purchase-registered-state";
import { PurchaseRegistrationForm } from "./purchase-registration-form";
import { useReviewPurchasedPrices } from "./purchased-prices-review";
import { usePurchaseChoicesQuery } from "./purchasing-queries";

export type NewPurchaseScreenProps = {
  access: BackofficeAccess;
  productCreationModal: ProductCreationModal;
  onSessionEnded: () => void;
  services: NewPurchaseScreenServices;
};

export function NewPurchaseScreen({
  access,
  productCreationModal,
  onSessionEnded,
  services,
}: NewPurchaseScreenProps) {
  const navigate = useNavigate();
  const reviewPurchasedPrices = useReviewPurchasedPrices();
  const data = usePurchaseChoicesQuery({
    fetchPurchaseChoices: services.fetchPurchaseChoices,
    onSessionEnded,
  });

  return (
    <PurchaseRegistrationForm
      access={access}
      productCreationModal={productCreationModal}
      eyebrow="Stock"
      title="Registrar compra"
      submitLabel="Registrar la compra"
      loadingWhat="el formulario de compra"
      data={data}
      initialValues={emptyPurchaseForm(null)}
      supplier={{ kind: "choose", services }}
      request={{ schema: purchaseRegistrationBodySchema, from: purchaseRegistrationRequestFrom }}
      submit={services.registerPurchase}
      onSubmitted={(values) => {
        if (reviewPurchasedPrices(values.lines)) {
          return;
        }
        void navigate({
          to: "/purchases",
          state: (previous) => ({ ...previous, ...PURCHASE_REGISTERED_STATE }),
        });
      }}
      onCancel={() => void navigate({ to: "/purchases" })}
      onSessionEnded={onSessionEnded}
    />
  );
}
