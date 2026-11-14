import type { RegisterCashSession } from "../register-cash-session.js";

export class FakeRegisterCashSession implements RegisterCashSession {
  private readonly open: boolean;

  constructor({ open = true }: { open?: boolean } = {}) {
    this.open = open;
  }

  isOpen(): boolean {
    return this.open;
  }
}
