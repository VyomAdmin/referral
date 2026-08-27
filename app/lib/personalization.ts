export type PersonalizationContext = Record<string, string>;

// Unresolved tokens are left as literal "{{token}}" text rather than blanked —
// a visibly wrong send is a bug someone will report; a silently blank one
// might not be, and a real email/SMS reaching a customer with a missing
// value in the middle of a sentence is worse than one with a placeholder.
export function renderTemplate(template: string, context: PersonalizationContext): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, token: string) =>
    Object.prototype.hasOwnProperty.call(context, token) ? context[token] : match,
  );
}
