"use client";

import * as React from "react";
import { useActionState } from "react";
import { Download, Trash2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import {
  deleteAccountAction,
  type AccountActionState,
} from "@/lib/auth/actions";

const initialState: AccountActionState = {};

/**
 * Outline-button styling for the export anchors. Rendered as real `<a>`
 * downloads so they work even before hydration (and keep the file download a
 * plain GET, not a form POST).
 */
const exportLinkClasses =
  "inline-flex items-center justify-center rounded-button font-medium transition-colors duration-150 select-none whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 border border-border-strong bg-surface text-foreground hover:bg-surface-subtle h-9.5 px-4 text-sm gap-2";

export interface AccountSettingsProps {
  email: string;
}

/**
 * Settings > Account: export the user's data (JSON/CSV) and delete the whole
 * account (typed confirmation). Deletion is irreversible and requires typing
 * DELETE exactly; the server re-checks this and deletes only the caller's own
 * data plus their auth user.
 */
export function AccountSettings({ email }: AccountSettingsProps) {
  const [state, formAction, pending] = useActionState(
    deleteAccountAction,
    initialState,
  );
  const [confirmText, setConfirmText] = React.useState("");
  const confirmed = confirmText.trim().toUpperCase() === "DELETE";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-4 w-4 text-brand" aria-hidden="true" />
            Export my data
          </CardTitle>
          <CardDescription>
            Download a copy of everything you own in LedgerAI — businesses,
            accounts, categories, transactions and imports. JSON keeps the full
            structure; CSV is one multi-section spreadsheet.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <a href="/account/export?format=json" download className={exportLinkClasses}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Download JSON
          </a>
          <a href="/account/export?format=csv" download className={exportLinkClasses}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Download CSV
          </a>
        </CardContent>
      </Card>

      <Card className="border-danger/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-danger">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete my account
          </CardTitle>
          <CardDescription>
            This permanently deletes your account ({email}) and every business,
            account, category, transaction and import you own, then removes your
            sign-in. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            {state.error && (
              <Alert tone="danger" title="Couldn't delete your account">
                {state.error}
              </Alert>
            )}

            <Field
              id="confirm"
              label='Type "DELETE" to confirm'
              hint="This is the only confirmation step — it runs immediately."
            >
              <Input
                id="confirm"
                name="confirm"
                autoComplete="off"
                placeholder="DELETE"
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                invalid={Boolean(state.error)}
                required
              />
            </Field>

            <Button
              type="submit"
              variant="danger"
              loading={pending}
              disabled={!confirmed}
            >
              Permanently delete my account
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
