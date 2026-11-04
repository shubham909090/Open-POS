import * as Dialog from "@radix-ui/react-dialog";
import { LoaderCircle } from "lucide-react";
import "../../styles/update-progress.css";

/** Keep local service edits unavailable until the updater fails or exits. */
export function UpdateProgressOverlay({ open }: { open: boolean }) {
  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="update-progress-backdrop" />
        <Dialog.Content
          className="update-progress-content"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            requestAnimationFrame(() => {
              document.querySelector<HTMLButtonElement>("[data-update-trigger]:not(:disabled)")?.focus();
            });
          }}
          aria-busy="true"
        >
          <LoaderCircle className="update-progress-spinner" size={24} aria-hidden="true" />
          <Dialog.Title>Updating Hub…</Dialog.Title>
          <Dialog.Description className="sr-only">
            The Windows installer will open when the update is ready.
          </Dialog.Description>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
