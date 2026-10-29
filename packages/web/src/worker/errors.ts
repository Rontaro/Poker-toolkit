/** The text of anything thrown, for a message that crosses to the page. */
export function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}
