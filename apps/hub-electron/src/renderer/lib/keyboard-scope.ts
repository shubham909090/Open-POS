/** Background workspaces must not handle keys while an approval or chooser owns focus. */
export function isKeyboardScopeActive(scope: HTMLElement | null): boolean {
  if (!scope?.isConnected || scope.closest('[hidden], [aria-hidden="true"]')) return false;
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]'))
    .filter((dialog) => dialog.dataset.state !== "closed" && !dialog.closest('[hidden], [aria-hidden="true"]'));
  const activeDialog = dialogs.at(-1);
  return !activeDialog || activeDialog.contains(scope);
}
