/**
 * Explicit owner confirmation for the one-off 2026-11-26 review restore.
 *
 * The time window alone cannot prove the accepts came from the e2e run, so an
 * apply stays blocked unless the owner confirms that no review group was
 * accepted personally in that window.
 */
export function restoreApplyAllowed(
  ambiguous: boolean,
  confirmedNoOwnerAccepts: boolean,
): boolean {
  return !ambiguous || confirmedNoOwnerAccepts;
}

export function restoreApplyBlockReason(ambiguous: boolean, confirmed: boolean): string | null {
  if (restoreApplyAllowed(ambiguous, confirmed)) return null;
  return (
    "Refusing to apply: the window cannot distinguish test accepts from owner accepts. " +
    "Re-run with --confirm-no-owner-accepts only if you are certain you accepted no review group in the window."
  );
}
