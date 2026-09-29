import { Button, InlineNotice, TextField } from "@purosur/ui";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { ArrowLeft, KeyRound, ShieldCheck, ShieldX, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { AccessFooterLink, AccessHeader, AccessLayout } from "./access-layout";
import { validatePasskeyName } from "./passkey-name";
import type { RecoveryTokenOutcome } from "./recovery-api";
import type { RegisterPasskeyScreenServices } from "./register-passkey-services";

function isDefinitiveRejection(outcome: RecoveryTokenOutcome<unknown>): boolean {
  switch (outcome.kind) {
    case "invalid":
    case "burned":
    case "expired":
    case "validation_failed":
    case "rate_limited":
      return true;
    case "ok":
    case "already_registered":
    case "failed":
      return false;
  }
}

type ReadyPhase = {
  kind: "ready";
  displayName: string;
  options: PublicKeyCredentialCreationOptionsJSON;
  attemptFailed: boolean;
  submitting: boolean;
};

type Phase =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "burned" }
  | { kind: "expired" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "loadError" }
  | ReadyPhase
  | { kind: "registered" };

export type RegisterPasskeyScreenProps = {
  services: RegisterPasskeyScreenServices;
};

function readToken(): string | null {
  const hash = window.location.hash;
  return hash.length > 1 ? hash.slice(1) : null;
}

function TokenErrorNotice({
  title,
  description,
  offerNewLink,
}: {
  title: string;
  description?: string;
  offerNewLink: boolean;
}) {
  return (
    <>
      <InlineNotice
        tone="error"
        icon={<TriangleAlert />}
        title={title}
        {...(description ? { description } : {})}
      />
      {offerNewLink ? (
        <AccessFooterLink
          to="/account-recovery"
          icon={<ArrowLeft />}
          label="Pedir un enlace nuevo"
        />
      ) : null}
    </>
  );
}

export function RegisterPasskeyScreen({ services }: RegisterPasskeyScreenProps) {
  const { fetchRegistrationOptions, redeemRecovery, startRegistration, signalUnknownCredential } =
    services;
  // A lazy initializer runs during the initial render, before any effect strips the fragment;
  // StrictMode's doubled call falls within that same render, so both reads see the same token.
  const [token] = useState<string | null>(() => readToken());
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    if (!token) {
      setPhase({ kind: "invalid" });
      return;
    }
    setPhase({ kind: "loading" });
    const outcome = await fetchRegistrationOptions(token);
    if (outcome.kind === "ok") {
      setPhase({
        kind: "ready",
        displayName: outcome.value.displayName,
        options: outcome.value.options,
        attemptFailed: false,
        submitting: false,
      });
    } else if (
      outcome.kind === "invalid" ||
      outcome.kind === "burned" ||
      outcome.kind === "expired"
    ) {
      setPhase({ kind: outcome.kind });
    } else if (outcome.kind === "rate_limited") {
      setPhase({ kind: "rate_limited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else {
      setPhase({ kind: "loadError" });
    }
  }, [token, fetchRegistrationOptions]);

  useEffect(() => {
    // A URL fragment never reaches server logs or a Referer header, but it's stripped right away
    // so it doesn't linger in the address bar; idempotent, so a StrictMode-doubled run is a no-op.
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    void load();
  }, [load]);

  // A rejected attempt needs fresh options before retrying; fetched now so the next click still
  // starts WebAuthn synchronously, within the browser's required user activation.
  async function refreshAfterRejectedAttempt(recoveryToken: string, readyPhase: ReadyPhase) {
    setPhase({ ...readyPhase, attemptFailed: true, submitting: true });
    const outcome = await fetchRegistrationOptions(recoveryToken);
    if (outcome.kind === "ok") {
      setPhase({
        kind: "ready",
        displayName: outcome.value.displayName,
        options: outcome.value.options,
        attemptFailed: true,
        submitting: false,
      });
    } else if (
      outcome.kind === "invalid" ||
      outcome.kind === "burned" ||
      outcome.kind === "expired"
    ) {
      setPhase({ kind: outcome.kind });
    } else if (outcome.kind === "rate_limited") {
      setPhase({ kind: "rate_limited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else {
      setPhase({ ...readyPhase, attemptFailed: true, submitting: false });
    }
  }

  async function handleRegister(readyPhase: ReadyPhase) {
    if (!token) {
      setPhase({ kind: "invalid" });
      return;
    }
    const validationError = validatePasskeyName(name);
    setNameError(validationError);
    if (validationError) {
      return;
    }
    setPhase({ ...readyPhase, attemptFailed: false, submitting: true });

    const registration = await startRegistration({ optionsJSON: readyPhase.options }).catch(
      () => null,
    );
    if (!registration) {
      setPhase({ ...readyPhase, attemptFailed: true, submitting: false });
      return;
    }

    const outcome = await redeemRecovery(token, registration, name.trim());
    // Every definitive rejection but "already registered" means the credential was never saved,
    // so the device should forget it; an ambiguous outcome never signals, since it may have landed.
    if (isDefinitiveRejection(outcome)) {
      const rpId = readyPhase.options.rp.id;
      if (rpId) {
        signalUnknownCredential({ rpId, credentialId: registration.id });
      }
    }
    if (outcome.kind === "ok") {
      setPhase({ kind: "registered" });
    } else if (
      outcome.kind === "invalid" ||
      outcome.kind === "burned" ||
      outcome.kind === "expired"
    ) {
      setPhase({ kind: outcome.kind });
    } else if (outcome.kind === "rate_limited") {
      setPhase({ kind: "rate_limited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else if (outcome.kind === "validation_failed" || outcome.kind === "already_registered") {
      await refreshAfterRejectedAttempt(token, readyPhase);
    } else {
      setPhase({ ...readyPhase, attemptFailed: true, submitting: false });
    }
  }

  if (phase.kind === "loading") {
    return (
      <AccessLayout>
        <AccessHeader heading="Registrá una passkey nueva" />
        <p role="status">Abriendo el registro…</p>
      </AccessLayout>
    );
  }

  if (phase.kind === "invalid") {
    return (
      <AccessLayout>
        <AccessHeader heading="Registrá una passkey nueva" />
        <TokenErrorNotice
          title="Este enlace no es válido"
          description="Revisá que el enlace esté completo."
          offerNewLink
        />
      </AccessLayout>
    );
  }

  if (phase.kind === "burned") {
    return (
      <AccessLayout>
        <AccessHeader heading="Registrá una passkey nueva" />
        <TokenErrorNotice
          title="Este enlace ya no se puede usar"
          description="Ya se usó o se pidió uno más nuevo."
          offerNewLink
        />
      </AccessLayout>
    );
  }

  if (phase.kind === "expired") {
    return (
      <AccessLayout>
        <AccessHeader heading="Registrá una passkey nueva" />
        <TokenErrorNotice
          title="Este enlace venció"
          description="Los enlaces valen 15 minutos."
          offerNewLink
        />
      </AccessLayout>
    );
  }

  if (phase.kind === "rate_limited") {
    return (
      <AccessLayout>
        <AccessHeader heading="Registrá una passkey nueva" />
        <InlineNotice
          tone="error"
          icon={<ShieldX />}
          title="Demasiados intentos desde esta conexión"
          description={retryAfterDetail(phase.retryAfterSeconds)}
        />
      </AccessLayout>
    );
  }

  if (phase.kind === "loadError") {
    return (
      <AccessLayout>
        <AccessHeader heading="Registrá una passkey nueva" />
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="No pudimos abrir el registro"
          description="Probá de nuevo en unos minutos."
        />
        <Button variant="secondary" onPress={() => void load()}>
          Reintentar
        </Button>
      </AccessLayout>
    );
  }

  if (phase.kind === "registered") {
    return (
      <AccessLayout>
        <AccessHeader heading="Registraste la passkey" />
        <InlineNotice
          tone="info"
          icon={<ShieldCheck />}
          title="Se cerraron las sesiones abiertas de tu cuenta"
          description="Si alguien más estaba adentro con tu cuenta, ya no lo está."
        />
        <AccessFooterLink to="/sign-in" icon={<ArrowLeft />} label="Ir a ingresar" />
      </AccessLayout>
    );
  }

  return (
    <AccessLayout>
      <AccessHeader
        eyebrow={phase.displayName}
        heading="Registrá una passkey nueva"
        description="Con ella vas a ingresar de ahora en adelante."
      />
      {phase.attemptFailed ? (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="No se pudo registrar la passkey"
          description="Podés volver a intentarlo con este mismo enlace."
        />
      ) : null}
      <TextField
        kind="plain-text"
        label="Nombre de la passkey"
        value={name}
        onChange={(value) => {
          setName(value);
          if (nameError) {
            setNameError(validatePasskeyName(value));
          }
        }}
        description="Por ejemplo, Notebook del local."
        required
        errorMessage={nameError}
      />
      <Button
        variant="primary"
        size="large"
        fullWidth
        icon={<KeyRound />}
        disabled={phase.submitting}
        onPress={() => void handleRegister(phase)}
      >
        Registrar la passkey
      </Button>
      <p className="text-detail text-text-subtle">
        Después conviene agregar una segunda, por ejemplo en el teléfono, desde Mi cuenta.
      </p>
    </AccessLayout>
  );
}
