"use client";

import * as React from "react";

export type ToastTone = "info" | "success" | "warning" | "danger";

export interface ToastData {
  id: string;
  title?: string;
  description?: React.ReactNode;
  tone: ToastTone;
}

type Listener = (toasts: ToastData[]) => void;

let listeners: Listener[] = [];
let toasts: ToastData[] = [];
let counter = 0;

function emit() {
  listeners.forEach((l) => l([...toasts]));
}

function pushToast(
  tone: ToastTone,
  input: { title?: string; description?: React.ReactNode; duration?: number },
) {
  const id = `toast-${++counter}`;
  const toast: ToastData = {
    id,
    title: input.title,
    description: input.description,
    tone,
  };
  toasts = [...toasts, toast];
  emit();

  const duration = input.duration ?? 5000;
  window.setTimeout(() => dismissToast(id), duration);
}

export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function toast(
  tone: ToastTone | { title?: string; description?: React.ReactNode; duration?: number },
  options?: { title?: string; description?: React.ReactNode; duration?: number },
) {
  if (typeof tone === "string") {
    pushToast(tone, options ?? {});
  } else {
    pushToast("info", tone);
  }
}

function subscribe(listener: Listener) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

/** React hook exposing toast helpers. */
export function useToast() {
  const [items, setItems] = React.useState<ToastData[]>(toasts);

  React.useEffect(() => {
    return subscribe(setItems);
  }, []);

  const notify = React.useCallback(
    (tone: ToastTone, input: { title?: string; description?: React.ReactNode; duration?: number } = {}) => {
      pushToast(tone, input);
    },
    [],
  );

  return {
    toasts: items,
    notify,
    dismiss: dismissToast,
    // Convenience helpers
    success: (input: { title?: string; description?: React.ReactNode; duration?: number }) =>
      notify("success", input),
    error: (input: { title?: string; description?: React.ReactNode; duration?: number }) =>
      notify("danger", input),
    warning: (input: { title?: string; description?: React.ReactNode; duration?: number }) =>
      notify("warning", input),
    info: (input: { title?: string; description?: React.ReactNode; duration?: number }) =>
      notify("info", input),
  };
}
