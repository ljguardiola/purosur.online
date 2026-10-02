import { Button, InlineNotice, ScreenHeader } from "@purosur/ui";
import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";
import { Clock, KeyRound, LifeBuoy, ShieldX, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { AccessFooterLink, AccessLayout } from "./access-layout";
import type { SignInScreenServices } from "./sign-in-services";

export type SignInOpeningNotice =
  | { kind: "expired" }
  | { kind: "check_failed" }
  | { kind: "rate_limited"; retryAfterSeconds: number };

export type SignInScreenProps = {
  openingNotice?: SignInOpeningNotice | undefined;
  onSignedIn: () => void;
  services: SignInScreenServices;
};

type Notice =
  | SignInOpeningNotice
  // From a failed sign-in attempt itself (the sign-in lockout), not the opening session check.
  | { kind: "blocked"; retryAfterSeconds: number }
  | { kind: "failed" };

// The uniform-failure notice covers a rejected credential, an origin mismatch, a network error,
// and a cancelled passkey prompt alike: nothing about it may reveal which one actually happened.
export function SignInScreen({ openingNotice, onSignedIn, services }: SignInScreenProps) {
  const { fetchAuthenticationOptions, authenticate, startAuthentication, signalUnknownCredential } =
    services;
  const [notice, setNotice] = useState<Notice | null>(openingNotice ?? null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSignIn() {
    setNotice(null);
    setSubmitting(true);

    const optionsOutcome = await fetchAuthenticationOptions();
    if (optionsOutcome.kind !== "ok") {
      setNotice({ kind: "failed" });
      setSubmitting(false);
      return;
    }

    const assertion: AuthenticationResponseJSON | null = await startAuthentication({
      optionsJSON: optionsOutcome.value,
    }).catch(() => null);
    if (!assertion) {
      setNotice({ kind: "failed" });
      setSubmitting(false);
      return;
    }

    const outcome = await authenticate(assertion);
    setSubmitting(false);
    if (outcome.kind === "ok") {
      onSignedIn();
      return;
    }
    if (outcome.kind === "rate_limited") {
      setNotice({ kind: "blocked", retryAfterSeconds: outcome.retryAfterSeconds });
      return;
    }
    if (outcome.kind === "unknown_passkey" && optionsOutcome.value.rpId) {
      signalUnknownCredential({ rpId: optionsOutcome.value.rpId, credentialId: assertion.id });
    }
    setNotice({ kind: "failed" });
  }

  return (
    <AccessLayout>
      <ScreenHeader
        focusableTitle
        eyebrow="Puro Sur"
        title="Ingresar"
        description="Con la passkey de este dispositivo: la huella, la cara o el PIN de la computadora o del teléfono."
      />
      {notice?.kind === "blocked" && (
        <InlineNotice
          tone="error"
          icon={<ShieldX />}
          title="Demasiados intentos desde esta conexión"
          description={retryAfterDetail(notice.retryAfterSeconds)}
        />
      )}
      {notice?.kind === "expired" && (
        <InlineNotice
          tone="info"
          icon={<Clock />}
          title="Tu sesión venció"
          description="Se cierra sola a los 30 minutos sin uso o a las 12 horas de haber ingresado."
        />
      )}
      {notice?.kind === "check_failed" && (
        <InlineNotice
          tone="warning"
          icon={<TriangleAlert />}
          title="No pudimos verificar tu sesión"
          description="Probá de nuevo en unos minutos."
        />
      )}
      {notice?.kind === "rate_limited" && (
        <InlineNotice
          tone="error"
          icon={<ShieldX />}
          title="Demasiadas solicitudes"
          description={retryAfterDetail(notice.retryAfterSeconds)}
        />
      )}
      {notice?.kind === "failed" && (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="No se pudo ingresar"
          description="Probá de nuevo."
        />
      )}
      <Button
        variant="primary"
        size="large"
        fullWidth
        icon={<KeyRound />}
        disabled={submitting}
        onPress={() => void handleSignIn()}
      >
        Ingresar con passkey
      </Button>
      <AccessFooterLink to="/account-recovery" icon={<LifeBuoy />} label="Perdí mis passkeys" />
    </AccessLayout>
  );
}
