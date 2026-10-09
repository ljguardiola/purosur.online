import type { SalesDeniedReason } from "../../shared/index.js";
import type { AlertKind } from "./alert-catalog.js";

export type PasskeyChangedDetail =
  | { action: "registered" | "removed"; passkeyName: string; actorId: string; via: "self" }
  | { action: "registered"; passkeyName: string; actorId: string; via: "recovery" }
  | { action: "removed"; passkeyName: string; actorId: string; via: "administrator" };

export interface RecoveryRequestedDetail {
  requestedAt: string;
  issuedAt: string;
  expiresAt: string;
}

export interface EmailChangedDetail {
  previousEmail: string;
  newEmail: string;
  actorId: string;
}

export interface SignInLockoutDetail {
  sourceAddress: string;
  failureCount: number;
  blockedUntil: string;
}

export interface AlertRoleSummary {
  name: string | null;
  isAdministrator: boolean;
}

export type AccessIncreasedDetail =
  | { cause: "created_as_administrator"; actorId: string }
  | {
      cause: "role_assigned";
      previousRole: AlertRoleSummary;
      newRole: AlertRoleSummary;
      actorId: string;
    }
  | {
      cause: "role_permissions_added";
      roleName: string;
      addedPermissionKeys: readonly string[];
      actorId: string;
    };

export interface RegisterEnrolledDetail {
  deviceId: string;
  hostname: string;
  windowsVersion: string;
  replacedInstallation: boolean;
}

export type EventQuarantineReason =
  | { kind: "unreadable" }
  | { kind: "missing_dependency"; aggregateType: string; aggregateId: string }
  | { kind: "not_recorded" };

export interface EventsQuarantinedDetail {
  deviceId: string;
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  reason: EventQuarantineReason;
}

export interface EventInvariantViolatedDetail {
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  breaks: string[];
}

export interface ArcaCertificateExpiringDetail {
  notAfter: string;
}

interface UpdateRequiredDetail {
  deviceId: string;
  appVersion: string;
}

interface RegisterSilentDetail {
  deviceId: string;
  lastAcceptedPushAt: string;
}

interface SalesDeniedDetail {
  deviceId: string;
  reason: SalesDeniedReason;
}

export interface AlertDetails {
  backoffice_passkey_changed: PasskeyChangedDetail;
  backoffice_recovery_requested: RecoveryRequestedDetail;
  user_email_changed: EmailChangedDetail;
  backoffice_sign_in_lockout: SignInLockoutDetail;
  user_access_increased: AccessIncreasedDetail;
  register_enrolled: RegisterEnrolledDetail;
  events_quarantined: EventsQuarantinedDetail;
  event_invariant_violated: EventInvariantViolatedDetail;
  arca_certificate_expiring: ArcaCertificateExpiringDetail;
  update_required: UpdateRequiredDetail;
  register_silent: RegisterSilentDetail;
  sales_denied: SalesDeniedDetail;
}

export type OpenAlertInput = {
  [Kind in AlertKind]: {
    kind: Kind;
    scope: string;
    locationId?: string;
    detail: AlertDetails[Kind];
  };
}[AlertKind];
