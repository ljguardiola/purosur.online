import {
  Button,
  ButtonLink,
  EmptyState,
  FloatingNotification,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
} from "@purosur/ui";
import { createLink } from "@tanstack/react-router";
import { Ban, Check, Laptop, LogOut, Play, ShieldAlert, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import {
  type CompromiseResponse,
  type CompromiseResponseItem,
  type CompromiseResponseStep,
  isRunbookRefusal,
} from "./compromise-response-api";
import { CompromiseResponseChecklist, itemLabel } from "./compromise-response-checklist";
import {
  useCompromiseResponseQuery,
  useReloadCompromiseResponse,
} from "./compromise-response-queries";
import type { CompromiseResponseScreenServices } from "./compromise-response-services";
import { CompromiseResponseStepCard } from "./compromise-response-step-card";
import { EndSessionsStepModal } from "./end-sessions-step-modal";
import { ForcePinResetsStepModal } from "./force-pin-resets-step-modal";
import { RevokeInstallationsStepModal } from "./revoke-installations-step-modal";
import { StepAttemptNotices } from "./step-attempt-notices";

const RegistersLink = createLink(ButtonLink);

const STEP_TEXT: Record<CompromiseResponseStep, { title: string; description: string }> = {
  revoke_every_installation: {
    title: "Revocar todas las instalaciones",
    description:
      "Todas las cajas de todas las sucursales dejan de sincronizar en el momento y lo que tengan guardado deja de servir.",
  },
  end_sessions_and_remove_passkeys: {
    title: "Cerrar todas las sesiones y dar de baja las passkeys de la cuenta sospechada",
    description:
      "Se cierran todas las sesiones abiertas, la tuya incluida, y la cuenta que elijas pierde todas sus passkeys.",
  },
  force_pin_resets: {
    title: "Forzar el reinicio de PIN",
    description:
      "Todos los usuarios de todas las sucursales tienen que definir un nuevo PIN en la caja.",
  },
  rotate_external_secrets: {
    title: "Rotar los secretos externos",
    description:
      "La aplicación no rota nada: rotá cada secreto donde vive y marcalo acá cuando esté hecho.",
  },
  notify: {
    title: "Avisar",
    description:
      "Vos decidís y te mantenés informado. Al personal del local solo se le da la instrucción operativa para cuando una caja no puede vender o emitir.",
  },
  re_enroll_registers: {
    title: "Volver a dar de alta cada caja",
    description:
      "El protocolo de restauración reconstruye los verificadores de PIN ya con los PIN nuevos.",
  },
};

type OpenModal = "revoke" | "endSessions" | "pinResets";

type ScreenNotice =
  | { kind: "startFailed" }
  | { kind: "attemptFailed" }
  | { kind: "outdated" }
  | { kind: "rateLimited"; retryAfterSeconds: number };

type Confirmation = { id: number; title: string; description: string };

export type CompromiseResponseScreenProps = {
  onSessionEnded: () => void;
  services: CompromiseResponseScreenServices;
};

export function CompromiseResponseScreen({
  onSessionEnded,
  services,
}: CompromiseResponseScreenProps) {
  const sendToMyAccount = useSendToMyAccount();
  const data = useCompromiseResponseQuery({
    fetchCompromiseResponse: services.fetchCompromiseResponse,
    onSessionEnded,
  });
  const reload = useReloadCompromiseResponse();
  const [openModal, setOpenModal] = useState<OpenModal | null>(null);
  const [notice, setNotice] = useState<ScreenNotice | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [confirmations, setConfirmations] = useState(0);
  const [starting, setStarting] = useState(false);
  const [pendingItem, setPendingItem] = useState<CompromiseResponseItem | null>(null);

  const current = data.status === "loaded" ? data.value : null;
  const canStart = data.status === "loaded" && (current === null || current.completed);

  function confirm(title: string, description: string) {
    setConfirmation({ id: confirmations, title, description });
    setConfirmations(confirmations + 1);
  }

  function stepDone(title: string, description: string) {
    setOpenModal(null);
    reload();
    confirm(title, description);
  }

  async function start() {
    setNotice(null);
    setStarting(true);
    const outcome = await services.startCompromiseResponse();
    setStarting(false);
    if (outcome.kind === "ok") {
      reload();
    } else if (outcome.kind === "unauthenticated") {
      onSessionEnded();
    } else if (outcome.kind === "forbidden") {
      sendToMyAccount();
    } else if (outcome.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else {
      setNotice({ kind: "startFailed" });
    }
  }

  async function mark(item: CompromiseResponseItem) {
    setNotice(null);
    setPendingItem(item);
    const outcome = await services.markItemDone(item);
    setPendingItem(null);
    if (outcome.kind === "ok") {
      reload();
      confirm("Marcado como hecho", itemLabel(item));
    } else if (isRunbookRefusal(outcome.kind)) {
      setNotice({ kind: "outdated" });
      reload();
    } else if (outcome.kind === "unauthenticated") {
      onSessionEnded();
    } else if (outcome.kind === "forbidden") {
      sendToMyAccount();
    } else if (outcome.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else {
      setNotice({ kind: "attemptFailed" });
    }
  }

  function stepContent(runbook: CompromiseResponse, state: CompromiseResponse["steps"][number]) {
    switch (state.step) {
      case "revoke_every_installation":
        return state.done ? null : (
          <div>
            <Button
              variant="primary"
              destructive
              icon={<Ban />}
              disabled={!state.available}
              onPress={() => setOpenModal("revoke")}
            >
              Revocar todas las instalaciones
            </Button>
          </div>
        );
      case "end_sessions_and_remove_passkeys":
        return state.done ? null : (
          <div>
            <Button
              variant="primary"
              destructive
              icon={<LogOut />}
              disabled={!state.available}
              onPress={() => setOpenModal("endSessions")}
            >
              Elegir la cuenta
            </Button>
          </div>
        );
      case "force_pin_resets":
        return state.done ? null : (
          <div>
            <Button
              variant="primary"
              destructive
              icon={<ShieldAlert />}
              disabled={!state.available}
              onPress={() => setOpenModal("pinResets")}
            >
              Forzar el reinicio de PIN
            </Button>
          </div>
        );
      case "rotate_external_secrets":
      case "notify":
        return (
          <CompromiseResponseChecklist
            items={runbook.items.filter((item) => item.step === state.step)}
            enabled={state.available}
            pendingItem={pendingItem}
            onMark={(item) => void mark(item)}
          />
        );
      case "re_enroll_registers":
        return (
          <div>
            <RegistersLink to="/registers" variant="text" icon={<Laptop />}>
              Ir a Cajas registradoras
            </RegistersLink>
          </div>
        );
    }
  }

  return (
    <ScreenLayout
      topBar={
        <div className="flex h-18 shrink-0 items-center justify-between border-border border-b bg-surface px-8">
          <div className="flex flex-col justify-center">
            <p className="text-text-subtle text-detail">Configuración</p>
            <ScreenTitle>Respuesta ante un compromiso</ScreenTitle>
          </div>
          {canStart ? (
            <Button
              variant="primary"
              icon={<Play />}
              disabled={starting}
              onPress={() => void start()}
            >
              Comenzar
            </Button>
          ) : null}
        </div>
      }
      bodyClassName="gap-4 p-6"
    >
      {data.status === "loading" && <LoadingPlaceholder variant="list" items={6} />}
      {data.status === "failed" && (
        <LoadFailure {...cloudLoadFailure(data, "la respuesta ante un compromiso")} />
      )}
      {notice?.kind === "startFailed" && (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="No se pudo comenzar"
          description="Probá de nuevo."
        />
      )}
      <StepAttemptNotices
        notice={notice?.kind === "startFailed" ? null : (notice ?? null)}
        failedTitle="No se pudo marcar como hecho"
      />
      {data.status === "loaded" && current === null && (
        <EmptyState
          variant="blank"
          icon={<ShieldAlert />}
          title="No hay una respuesta en curso"
          description="Comenzá una para seguir los pasos en el orden que deja menos tiempo abierto."
        />
      )}
      {current?.steps.map((state, index) => (
        <CompromiseResponseStepCard
          key={state.step}
          number={index + 1}
          title={STEP_TEXT[state.step].title}
          description={STEP_TEXT[state.step].description}
          state={state}
        >
          {stepContent(current, state)}
        </CompromiseResponseStepCard>
      ))}
      <RevokeInstallationsStepModal
        open={openModal === "revoke"}
        onClose={() => setOpenModal(null)}
        onDone={() =>
          stepDone("Instalaciones revocadas", "Cada caja se da de alta de nuevo con un código.")
        }
        onOutdated={reload}
        onSessionEnded={onSessionEnded}
        services={services}
      />
      <EndSessionsStepModal
        open={openModal === "endSessions"}
        onClose={() => setOpenModal(null)}
        onDone={onSessionEnded}
        onOutdated={reload}
        onSessionEnded={onSessionEnded}
        services={services}
      />
      <ForcePinResetsStepModal
        open={openModal === "pinResets"}
        onClose={() => setOpenModal(null)}
        onDone={() =>
          stepDone("Reinicio de PIN exigido", "Cada usuario define un nuevo PIN en la caja.")
        }
        onOutdated={reload}
        onSessionEnded={onSessionEnded}
        services={services}
      />
      {confirmation === null ? null : (
        <FloatingNotification
          key={confirmation.id}
          tone="success"
          icon={<Check />}
          title={confirmation.title}
          description={confirmation.description}
          onDismiss={() => setConfirmation(null)}
        />
      )}
    </ScreenLayout>
  );
}
