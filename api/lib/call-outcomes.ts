export const TERMINAL_TWILIO_STATUSES = new Set([
  "completed",
  "busy",
  "no-answer",
  "failed",
  "canceled",
]);

export type TerminalCallOutcome =
  | "conversation_completed"
  | "completed_without_conversation"
  | "busy"
  | "no_answer"
  | "failed"
  | "canceled";

export function terminalOutcomeForStatus(status: string, turnCount: number): TerminalCallOutcome | null {
  switch (status.trim().toLowerCase()) {
    case "completed":
      return turnCount > 1 ? "conversation_completed" : "completed_without_conversation";
    case "busy":
      return "busy";
    case "no-answer":
      return "no_answer";
    case "failed":
      return "failed";
    case "canceled":
      return "canceled";
    default:
      return null;
  }
}

export function safeTwilioDiagnostic(value: unknown, maxLength = 500): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const normalized = String(value).trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}
