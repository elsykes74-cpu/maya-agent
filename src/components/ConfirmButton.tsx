import { useState, type ReactNode, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

/**
 * Replaces the native window.confirm() with an accessible AlertDialog.
 * Render a trigger via `children` (any element) or pass a `label` to get a
 * default Button trigger. Fires `onConfirm` only after the user clicks the
 * destructive action.
 */
export function ConfirmButton({
  label,
  children,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = true,
  buttonProps,
  onConfirm,
}: {
  label?: ReactNode;
  children?: ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  buttonProps?: ComponentProps<typeof Button>;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);

  const openDialog = () => setOpen(true);

  return (
    <>
      {children ? (
        <span onClick={openDialog} className="contents">
          {children}
        </span>
      ) : (
        <Button {...buttonProps} onClick={openDialog}>
          {label}
        </Button>
      )}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
            <AlertDialogAction
              className={destructive ? "bg-red-600 hover:bg-red-700 text-white" : ""}
              onClick={() => { setOpen(false); onConfirm(); }}
            >
              {confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
