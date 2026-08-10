"use client"

import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog"

import { cn } from "@/lib/utils"

/**
 * AlertDialog rather than Dialog: it hardcodes `modal: true` and
 * `disablePointerDismissal: true`, so a click outside can never close it.
 *
 * Escape needs one more thing. The open state resolves as `openProp ?? open`,
 * so passing a controlled `open` and **no `onOpenChange`** leaves an internal
 * close attempt with nowhere to land — Escape becomes inert. Add an
 * `onOpenChange` and the gate quietly stops being a gate.
 */
function AlertDialog(props: AlertDialogPrimitive.Root.Props) {
  return <AlertDialogPrimitive.Root {...props} />
}

/**
 * Portal + backdrop + popup in one part. They are never styled apart, and
 * folding them keeps call sites from nesting four components to show one box.
 */
function AlertDialogPopup({
  className,
  ...props
}: AlertDialogPrimitive.Popup.Props) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Backdrop
        data-slot="alert-dialog-backdrop"
        className="fixed inset-0 z-50 bg-bg/80 backdrop-blur-sm"
      />
      <AlertDialogPrimitive.Popup
        data-slot="alert-dialog-popup"
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2",
          // The body can hold a QR plus buttons plus a fallback link; on a
          // 375px phone that overflows, so it scrolls inside the popup.
          "max-h-[85dvh] overflow-y-auto rounded-2xl border border-line bg-surface p-6",
          className,
        )}
        {...props}
      />
    </AlertDialogPrimitive.Portal>
  )
}

/** Not decoration — Base UI wires `aria-labelledby` off this. */
function AlertDialogTitle({
  className,
  ...props
}: AlertDialogPrimitive.Title.Props) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn(
        "font-display text-base font-bold uppercase tracking-wider text-ink",
        className,
      )}
      {...props}
    />
  )
}

/** Not decoration — Base UI wires `aria-describedby` off this. */
function AlertDialogDescription({
  className,
  ...props
}: AlertDialogPrimitive.Description.Props) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("text-sm leading-relaxed text-fg-muted", className)}
      {...props}
    />
  )
}

export {
  AlertDialog,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogDescription,
}
