import {
  Button,
  EmptyState,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  Modal,
  useRequestForm,
} from "@purosur/ui";
import { Check, FileText, Globe, Truck, Upload, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { purchaseSupplierOptions } from "./purchase-form";
import { useSuppliersQuery } from "./purchasing-queries";
import { type ReadNotice, readNoticeContent } from "./supplier-price-list-read-notice";
import { webPageRefusalHint, webPageRefusalMessage } from "./supplier-price-list-web-page-refusal";
import type {
  loadSupplierPriceListWebPage,
  uploadSupplierPriceList,
  WebPageRefusalReason,
} from "./supplier-price-lists-api";
import type { fetchSuppliers } from "./suppliers-api";
import {
  EMPTY_UPLOAD_FORM,
  UPLOAD_FIELD_MESSAGES,
  UPLOAD_FIELDS,
  type UploadSource,
  uploadRequestFrom,
  uploadRequestSchema,
} from "./upload-supplier-price-list-form";

export type UploadSupplierPriceListModalServices = {
  uploadSupplierPriceList: typeof uploadSupplierPriceList;
  loadSupplierPriceListWebPage: typeof loadSupplierPriceListWebPage;
  fetchSuppliers: typeof fetchSuppliers;
};

type UploadSupplierPriceListModalProps = {
  open: boolean;
  initialSupplierId: string | null;
  services: UploadSupplierPriceListModalServices;
  onUploaded: () => void;
  onClose: () => void;
  onSessionEnded: () => void;
};

const SOURCE_OPTIONS = [
  {
    value: "PDF" as const satisfies UploadSource,
    label: "Archivo PDF",
    description: "Se sube desde la computadora",
    icon: <FileText />,
  },
  {
    value: "WEB_PAGE" as const satisfies UploadSource,
    label: "Página web",
    description: "Se lee desde su dirección en internet",
    icon: <Globe />,
  },
] as const;

function UploadNotice({ notice }: { notice: ReadNotice | null }) {
  return notice === null ? null : <InlineNotice {...readNoticeContent(notice)} />;
}

export function UploadSupplierPriceListModal({
  open,
  initialSupplierId,
  services,
  onUploaded,
  onClose,
  onSessionEnded,
}: UploadSupplierPriceListModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const [notice, setNotice] = useState<ReadNotice | null>(null);
  const [refusedPage, setRefusedPage] = useState<{
    reason: WebPageRefusalReason;
    url: string;
  } | null>(null);
  const suppliers = useSuppliersQuery({
    fetchSuppliers: services.fetchSuppliers,
    enabled: open,
    onSessionEnded,
  });
  const { form, submit, submitting, reset, values } = useRequestForm({
    defaultValues: EMPTY_UPLOAD_FORM,
    request: { schema: uploadRequestSchema, from: uploadRequestFrom },
    fields: UPLOAD_FIELDS,
    messages: UPLOAD_FIELD_MESSAGES,
    onSubmit: async (_request, { parsed, values, showWireFieldError, showFieldError }) => {
      if (parsed === undefined) {
        return;
      }
      setNotice(null);
      setRefusedPage(null);
      const outcome =
        parsed.source === "WEB_PAGE"
          ? await services.loadSupplierPriceListWebPage({
              supplierId: parsed.supplierId,
              url: parsed.url,
            })
          : values.file === null
            ? undefined
            : await services.uploadSupplierPriceList(
                { supplierId: parsed.supplierId, fileName: parsed.fileName },
                values.file,
              );
      if (outcome === undefined) {
        return;
      }
      switch (outcome.kind) {
        case "ok":
          onUploaded();
          return;
        case "unauthenticated":
          onSessionEnded();
          return;
        case "forbidden":
          sendToMyAccount();
          return;
        case "validation_failed":
          if (!showWireFieldError(outcome.field)) {
            setNotice({ kind: "attemptFailed" });
          }
          return;
        case "daily_cap_reached":
          setNotice({ kind: "dailyCapReached" });
          return;
        case "page_refused":
          showFieldError("url", webPageRefusalMessage(outcome.reason));
          setRefusedPage({ reason: outcome.reason, url: values.url });
          return;
        case "file_too_large":
          setNotice({ kind: "fileTooLarge" });
          return;
        case "not_a_pdf":
          setNotice({ kind: "notAPdf" });
          return;
        case "supplier_inactive":
          setNotice({ kind: "supplierInactive" });
          return;
        case "supplier_not_found":
          setNotice({ kind: "supplierNotFound" });
          return;
        case "reading_unavailable":
          setNotice({ kind: "readingUnavailable" });
          return;
        case "rate_limited":
          setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
          return;
        case "not_found":
        case "not_a_web_page":
        case "failed":
          setNotice({ kind: "attemptFailed" });
          return;
      }
    },
  });

  useEffect(() => {
    if (open) {
      reset({ ...EMPTY_UPLOAD_FORM, supplierId: initialSupplierId });
      setNotice(null);
      setRefusedPage(null);
    }
  }, [open, initialSupplierId, reset]);

  const hint =
    values.source === "WEB_PAGE" && refusedPage?.url === values.url
      ? webPageRefusalHint(refusedPage.reason)
      : "Se leen los ítems, las presentaciones y los precios. Nada se guarda hasta revisar cada ítem.";

  const supplierOptions =
    suppliers.status === "loaded"
      ? purchaseSupplierOptions(suppliers.value.filter((supplier) => supplier.active))
      : undefined;

  return (
    <Modal
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      width="standard"
      tone="info"
      icon={<Upload />}
      context="Pedidos · Listas de proveedores"
      title="Cargar una lista"
      closable
      footer={
        <>
          <Button
            variant="secondary"
            size="large"
            icon={<X />}
            disabled={submitting}
            onPress={onClose}
          >
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="large"
            icon={<Check />}
            fullWidth
            dataStatus={suppliers.status}
            disabled={submitting}
            onPress={() => void submit()}
          >
            Leer la lista
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <UploadNotice notice={notice} />
        {suppliers.status === "failed" ? (
          <LoadFailure {...cloudLoadFailure(suppliers, "los proveedores")} />
        ) : suppliers.status === "loading" ? (
          <LoadingPlaceholder variant="form" fields={1} />
        ) : supplierOptions === undefined ? (
          <EmptyState
            icon={<Truck />}
            title="No hay proveedores activos"
            description="Creá uno en Proveedores para cargar su lista."
            variant="blank"
          />
        ) : (
          <form.AppField name="supplierId">
            {(field) => (
              <field.ComboBox
                label="Proveedor"
                placeholder="Elegí un proveedor"
                options={supplierOptions}
                required
              />
            )}
          </form.AppField>
        )}
        <form.AppField name="source">
          {(field) => (
            <field.OptionCardGroup
              label="De dónde sale la lista"
              options={SOURCE_OPTIONS}
              required
            />
          )}
        </form.AppField>
        {values.source === "PDF" ? (
          <form.AppField name="file">
            {(field) => (
              <field.FilePicker
                label="Archivo"
                required
                accept="application/pdf,.pdf"
                chooseText="Elegir un archivo"
                chooseAnotherText="Elegir otro archivo"
              />
            )}
          </form.AppField>
        ) : (
          <form.AppField name="url">
            {(field) => (
              <field.TextField kind="plain-text" label="Dirección de la página" required />
            )}
          </form.AppField>
        )}
        {hint === undefined ? null : <p className="text-detail text-text-subtle">{hint}</p>}
      </div>
    </Modal>
  );
}
