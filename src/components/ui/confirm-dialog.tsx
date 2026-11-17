"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  /** Extra warning shown in the dialog body. Defaults to the destructive-action copy. */
  notice?: React.ReactNode;
  /** Urgent, time-boxed decisions use `alertdialog`. Defaults to `dialog`. */
  role?: "dialog" | "alertdialog";
  /** Use `primary` when confirming is the safe action (e.g. staying signed in). */
  confirmVariant?: "primary" | "danger" | "dangerOutline";
  cancelVariant?: "outline" | "dangerOutline";
}

/** Generic destructive/blocking action confirmation dialog. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  pending = false,
  notice,
  role = "dialog",
  confirmVariant = "danger",
  cancelVariant = "outline",
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      role={role}
      footer={
        <>
          <Button variant={cancelVariant} onClick={onClose} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            onClick={() => void onConfirm()}
            loading={pending}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Alert tone="danger">
        {notice ?? (
          <>
            This action cannot be undone. Make sure you&apos;re deleting the
            right record before continuing.
          </>
        )}
      </Alert>
    </Modal>
  );
}