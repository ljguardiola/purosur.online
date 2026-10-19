import { Button, formatDayAndTime, Tag } from "@purosur/ui";
import type { CompromiseResponse, CompromiseResponseItem } from "./compromise-response-api";

const ITEM_TEXT: Record<CompromiseResponseItem, { label: string; detail?: string }> = {
  mercado_pago_webhook_secret: { label: "Secreto del webhook de Mercado Pago" },
  whatsapp_webhook_token: { label: "Token del webhook de WhatsApp" },
  whatsapp_webhook_secret: { label: "Secreto del webhook de WhatsApp" },
  claude_api_key: { label: "Clave de la API de Claude" },
  postgres_credentials: { label: "Credenciales de Postgres" },
  ci_deployment_credentials: { label: "Credenciales de despliegue de CI" },
  storage_bucket_credentials: { label: "Credenciales del bucket" },
  arca_certificate_and_private_key: {
    label: "Certificado y clave privada de ARCA, si pudieron quedar expuestos",
    detail: "Renovarlos no corta la emisión mientras el certificado actual siga vigente.",
  },
  notify: { label: "Avisé y di la instrucción operativa al personal del local" },
};

export function itemLabel(item: CompromiseResponseItem): string {
  return ITEM_TEXT[item].label;
}

type CompromiseResponseChecklistProps = {
  items: CompromiseResponse["items"];
  enabled: boolean;
  pendingItem: CompromiseResponseItem | null;
  onMark: (item: CompromiseResponseItem) => void;
};

export function CompromiseResponseChecklist({
  items,
  enabled,
  pendingItem,
  onMark,
}: CompromiseResponseChecklistProps) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map(({ item, done, doneAt }) => {
        const { label, detail } = ITEM_TEXT[item];
        return (
          <li
            key={item}
            className="flex items-center justify-between gap-4 rounded-lg bg-surface-subtle p-4"
          >
            <div className="flex flex-col gap-1">
              <p className="text-body text-text">{label}</p>
              {detail === undefined ? null : (
                <p className="text-detail text-text-subtle">{detail}</p>
              )}
            </div>
            {done && doneAt !== null ? (
              <Tag tone="success" variant="status">
                {`Hecho el ${formatDayAndTime(doneAt)}`}
              </Tag>
            ) : (
              <Button
                variant="secondary"
                disabled={!enabled || pendingItem !== null}
                onPress={() => onMark(item)}
              >
                Marcar como hecho
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
