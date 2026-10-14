/** Thrown by services when user input breaks a business rule. Messages are pt-BR. */
export class ValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(errors.join(" "));
    this.name = "ValidationError";
  }
}

export function assertValid(errors: string[]): void {
  if (errors.length) throw new ValidationError(errors);
}
