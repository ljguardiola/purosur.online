export interface RememberedPerson {
  id: string;
  firstName: string;
  lastActive: boolean;
}

export interface RememberedPeople {
  remember(userId: string): void;
  markLastActive(userId: string): void;
  signInCandidates(): RememberedPerson[];
}
