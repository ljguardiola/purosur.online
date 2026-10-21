import { Button, formatPointOfSaleNumber, InlineNotice, Modal } from "@purosur/ui";
import type { startAuthentication } from "@simplewebauthn/browser";
import { ShieldX, Trash2, TriangleAlert, X } from "lucide-react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import type {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import { useAuthorizedAttempt } from "../platform/use-authorized-attempt";
import type { OfflinePointOfSale, retireOfflinePointOfSale } from "./offline-points-of-sale-api";

export type RetireOfflinePointOfSaleModalServices = {
  retireOfflinePointOfSale: typeof retireOfflinePointOfSale;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

type RetireOfflinePointOfSaleModalProps = {
  target: OfflinePointOfSale | null;
  onClose: () => void;
  onRetired: (retired: OfflinePointOfSale) => void;
  onOutdated: () => void;
  onSessionEnded: () => void;
  services: RetireOfflinePointOfSaleModalServices;
};

export function RetireOfflinePointOfSaleModal({
  target,
  onClose,
  onRetired,
  onOutdated,
  onSessionEnded,
  services,
}: RetireOfflinePointOfSaleModalProps) {
  const {
    retireOfflinePointOfSale,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services;
  const open = target !== null;
  const {
    attempt,
    running: retiring,
    notice,
    modal,
  } = useAuthorizedAttempt<
    Awaited<ReturnType<typeof retireOfflinePointOfSale>>,
    "assigned" | "notFound"
  >({
    open,
    actionName: "Dar de baja el punto de venta",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });

  function retire(item: OfflinePointOfSale) {
    return attempt(
      () => retireOfflinePointOfSale(item.pointOfSaleNumber),
      (outcome, opening) => {
        if (outcome.kind === "retired") {
          if (opening.current) {
            onClose();
          }
          onRetired(item);
        } else if (outcome.kind === "already_retired") {
          if (opening.current) {
            onClose();
          }
          onOutdated();
        } else if (outcome.kind === "assigned") {
          opening.showNotice("assigned");
          onOutdated();
        } else if (outcome.kind === "not_found") {
          opening.showNotice("notFound");
          onOutdated();
        }
      },
    );
  }

  return (
    <>
      <Modal
        open={open}
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
        width="confirmation"
        tone="error"
        icon={<Trash2 />}
        title={
          target
            ? `¿Dar de baja el punto de venta ${formatPointOfSaleNumber(target.pointOfSaleNumber)}?`
            : ""
        }
        closable
        footer={
          <>
            <Button
              variant="secondary"
              size="large"
              icon={<X />}
              fullWidth
              disabled={retiring}
              onPress={onClose}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              destructive
              size="large"
              icon={<Trash2 />}
              fullWidth
              disabled={retiring}
              onPress={() => target && void retire(target)}
            >
              Dar de baja
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {notice?.kind === "assigned" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="Una caja usa este punto de venta: no se puede dar de baja."
            />
          )}
          {notice?.kind === "notFound" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="Este punto de venta ya no existe."
            />
          )}
          {notice?.kind === "attemptFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo dar de baja el punto de venta"
              description="Probá de nuevo."
            />
          )}
          {notice?.kind === "rateLimited" && (
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title="Demasiadas solicitudes"
              description={retryAfterDetail(notice.retryAfterSeconds)}
            />
          )}
          <p className="text-body text-text">
            Dalo de baja acá solo después de darle la baja en ARCA. Deja de deber los informes
            quincenales desde la quincena en curso, salvo los que ARCA informe como adeudados; los
            que ya debe siguen pendientes.
          </p>
          <InlineNotice
            tone="warning"
            icon={<TriangleAlert />}
            description="No se puede deshacer y ninguna caja podrá volver a usarlo."
          />
        </div>
      </Modal>
      {modal}
    </>
  );
}
