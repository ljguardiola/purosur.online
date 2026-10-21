export interface ReplenishedUser {
  userId: string;
  firstName: string;
  roleId: string;
  salt: string | null;
  pinHash: string | null;
  active: boolean;
  version: number;
}
