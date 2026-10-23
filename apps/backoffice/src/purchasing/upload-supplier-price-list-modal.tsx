import {
  Button,
  EmptyState,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  Modal,
  useRequestForm,
} from "@purosur/ui";
import { Check, FileText, Globe, ShieldX, TriangleAlert, Truck, Upload, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { purchaseSupplierOptions } from "./purchase-form";
import { useSuppliersQuery } from "./purchasing-queries";
import { webPageRefusalMessage } from "./supplier-price-list-web-page-refusal";
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

type Notice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "dailyCapReached" }
  | { kind: "fileTooLarge" }
  | { kind: "notAPdf" }
  | { kind: "supplierInactive" }
  | { kind: "supplierNotFound" }
  | { kind: "readingUnavailable" };

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
    description: "Se lee al tocar Actualizar",
    icon: <Globe />,
  },
] as const;

function UploadNotice({ notice }: { notice: Notice | null }) {
  switch (notice?.kind) {
    case undefined:
      return null;
    case "dailyCapReached":
      return (
        <InlineNotice
          tone="warning"
          icon={<TriangleAlert />}
          title="Por hoy no se pueden leer más listas"
          description="Se llegó al tope de lecturas del día de esta sucursal. La lista se puede cargar mañana."
        />
      );
    case "fileTooLarge":
      return (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="El archivo es demasiado grande"
          description="Elegí un PDF más liviano."
        />
      );
    case "notAPdf":
      return (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="El archivo no es un PDF válido"
          description="Elegí otro archivo."
        />
      );
    case "supplierInactive":
      return (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="Este proveedor está desactivado"
          description="Elegí otro proveedor."
        />
      );
    case "supplierNotFound":
      return (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="Este proveedor ya no existe"
          description="Elegí otro proveedor."
        />
      );
    case "readingUnavailable":
      return (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="La lectura de listas no está disponible"
          description="Volvé a intentarlo más tarde."
        />
      );
    case "rateLimited":
      return (
        <InlineNotice
          tone="error"
          icon={<ShieldX />}
          title="Demasiadas solicitudes"
          description={retryAfterDetail(notice.retryAfterSeconds)}
        />
      );
    case "attemptFailed":
      return (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="No se cargó la lista"
          description="Volvé a intentarlo."
        />
      );
  }
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
  const [notice, setNotice] = useState<Notice | null>(null);
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
              <field.Select
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
        <p className="text-detail text-text-subtle">
          {values.source === "WEB_PAGE" && refusedPage?.url === values.url
            ? "Tampoco se lee una página que redirige más de 3 veces, tarda demasiado, es muy pesada o no es PDF ni una página web."
            : "Se leen los ítems, las presentaciones y los precios. Nada se guarda hasta revisar cada ítem."}
        </p>
      </div>
    </Modal>
  );
}
