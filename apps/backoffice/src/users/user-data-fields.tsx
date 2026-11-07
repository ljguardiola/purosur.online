import type { BranchUser } from "../platform/branch-users-api";
import { roleDisplayName } from "../platform/role-display-name";

export function UserDataFields({ user }: { user: BranchUser }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="font-bold text-text-subtle text-detail">Rol</p>
        <p className="font-semibold text-body text-text">{roleDisplayName(user.role)}</p>
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-bold text-text-subtle text-detail">Correo</p>
        <p className="font-semibold text-body text-text">{user.email}</p>
      </div>
    </div>
  );
}
