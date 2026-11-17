/**
 * Build one count phrase with consistent pluralisation and verb agreement.
 *
 * Examples:
 *   countPhrase(1, "transaction", { verb: ["has", "have"] }) -> "1 transaction has"
 *   countPhrase(2, "transaction", { verb: ["has", "have"] }) -> "2 transactions have"
 *   countPhrase(1, "invalid row")                            -> "1 invalid row"
 */
export function countPhrase(
  count: number,
  singular: string,
  options: {
    /** Explicit plural when the noun does not simply take "s". */
    plural?: string;
    /** Singular and plural forms of the following verb, when one is needed. */
    verb?: readonly [string, string];
  } = {},
): string {
  const isSingular = count === 1;
  const noun = isSingular ? singular : (options.plural ?? `${singular}s`);
  const phrase = `${count} ${noun}`;
  return options.verb ? `${phrase} ${isSingular ? options.verb[0] : options.verb[1]}` : phrase;
}
