"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { Landmark, Pencil, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import {
  createAccountAction,
  updateAccountAction,
  deleteAccountAction,
  type AccountActionState,
} from "@/lib/actions/accounts";
import { CURRENCIES } from "@/lib/validation/business";
import type { AccountServiceData } from "@/lib/services/accounts";

export interface AccountsManagerProps {
  accounts: AccountServiceData[];
  currency: string;
}

export function AccountsManager({ accounts, currency }: AccountsManagerProps) {
  const router = useRouter();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<AccountServiceData | null>(null);

  const editing =
    editId === null ? null : accounts.find((a) => a.id === editId) ?? null;

  const openCreate = () => {
    setEditId(null);
    setFormOpen(true);
  };

  const openEdit = (account: AccountServiceData) => {
    setEditId(account.id);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const fd = new FormData();
    fd.set("id", deleting.id);
    await deleteAccountAction(fd);
    setDeleting(null);
    router.refresh();
  };

  const handleSaved = () => {
    setFormOpen(false);
    router.refresh();
  };

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>Accounts</CardTitle>
          <Button size="sm" onClick={openCreate} leftIcon={<Plus className="h-3.5 w-3.5" />}>
            Add account
          </Button>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <EmptyState
              icon={<Landmark className="h-6 w-6" />}
              title="No accounts yet"
              description="Add a bank or wallet account so imported transactions can be linked to it."
              action={
                <Button onClick={openCreate} leftIcon={<Plus className="h-4 w-4" />}>
                  Add account
                </Button>
              }
            />
          ) : (
            <ul className="space-y-2">
              {accounts.map((account) => (
                <li
                  key={account.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-field border border-border bg-surface-subtle/40 px-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{account.name}</p>
                    <p className="text-sm text-muted">
                      {account.institution ?? "No institution"} · {account.currency}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge tone="info">{account.currency}</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${account.name}`}
                      onClick={() => openEdit(account)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${account.name}`}
                      onClick={() => setDeleting(account)}
                    >
                      <Trash2 className="h-4 w-4 text-danger" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {formOpen && (
        <AccountFormModal
          key={editId ?? "new"}
          editing={editing}
          defaultCurrency={currency}
          onClose={() => setFormOpen(false)}
          onSaved={handleSaved}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Delete account?"
        description={
          deleting
            ? `"${deleting.name}" will be removed. Existing transactions keep their data but are unlinked.`
            : undefined
        }
      />
    </>
  );
}

interface AccountFormModalProps {
  editing: AccountServiceData | null;
  defaultCurrency: string;
  onClose: () => void;
  onSaved: () => void;
}

const initialState: AccountActionState = {};

function AccountFormModal({
  editing,
  defaultCurrency,
  onClose,
  onSaved,
}: AccountFormModalProps) {
  const action = editing ? updateAccountAction : createAccountAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  const notified = React.useRef(false);
  React.useEffect(() => {
    if (state.ok && !notified.current) {
      notified.current = true;
      onSaved();
    }
  }, [state.ok, onSaved]);

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "Edit account" : "Add account"}
      description="Linked to transactions you import or create."
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="account-form" loading={pending}>
            {editing ? "Save changes" : "Add account"}
          </Button>
        </>
      }
    >
      <form id="account-form" action={formAction} className="flex flex-col gap-4">
        {state.error && (
          <Alert tone="danger" title="Couldn't save the account">
            {state.error}
          </Alert>
        )}

        {editing && <input type="hidden" name="id" value={editing.id} />}

        <Field label="Account name" required htmlFor="account-name">
          <Input
            id="account-name"
            name="name"
            placeholder="e.g. Kuda business account"
            required
            maxLength={80}
            defaultValue={editing?.name}
          />
        </Field>
        <Field label="Institution" htmlFor="account-institution">
          <Input
            id="account-institution"
            name="institution"
            placeholder="e.g. Kuda Microfinance Bank"
            maxLength={80}
            defaultValue={editing?.institution ?? ""}
          />
        </Field>
        <Field label="Currency" htmlFor="account-currency">
          <Select
            id="account-currency"
            name="currency"
            defaultValue={editing?.currency ?? defaultCurrency}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
      </form>
    </Modal>
  );
}