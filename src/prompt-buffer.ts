/**
 * Normalize suppressed type-ahead text into the single-line REPL prompt.
 * readline's prompt is one line, so Enter typed during an active chain is
 * preserved as spacing rather than being auto-submitted behind the user.
 */
export function normalizeTypeaheadDraftForPrompt(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\n+$/, '')
    .replace(/\n/g, ' ');
}
