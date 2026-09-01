"use client";

import * as React from "react";
import { useActionState } from "react";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import {
  createTransactionAction,
  updateTransactionAction,
  type TransactionActionState,
} from "@/lib/actions/transactions";
import { TRANSACTION_TYPE_LABELS } from "@/lib/validation/transaction";

export interface TransactionFormValues {
  id?: string;
  date: string;
  description: string;
  amount: string;
  type: "income" | "expense" | "transfer";
  accountId: string;
  categoryId: string;
  reference: string;
  notes: string;
}

export interface TransactionFormProps {
  open: boolean;
  onClose: () => void;
  /** When provided the form edits this transaction; otherwise it creates. */
  transaction?: TransactionFormValues | null;
  /** Default type to preselect for new transactions (income/expense pages). */
  defaultType?: "income" | "expense" | "transfer";
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string; type: "income" | "expense" }[];
  onSaved: () => void;
}

const initialState: TransactionActionState = {};

export function TransactionForm({
  open,
  onClose,
  transaction,
  defaultType,
  accounts,
  categories,
  onSaved,
}: TransactionFormProps) {
  const isEdit = !!transaction?.id;
  const action = isEdit ? updateTransactionAction : createTransactionAction;

  const [state, formAction, pending] = useActionState(action, initialState);
  const [type, setType] = React.useState<TransactionFormValues["type"]>(
    (transaction?.type as TransactionFormValues["type"]) ??
      defaultType ??
      "income",
  );

  // After a successful save, notify the parent (close + refresh) exactly once.
  const notified = React.useRef(false);
  React.useEffect(() => {
    if (state.ok && !notified.current) {
      notified.current = true;
      onSaved();
    }
  }, [state.ok, onSaved]);

  const availableCategories =
    type === "transfer"
      ? []
      : categories.filter((c) => c.type === type);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit transaction" : "Add transaction"}
      description="All changes are scoped to your business and applied deterministically."
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="transaction-form" loading={pending}>
            {isEdit ? "Save changes" : "Add transaction"}
          </Button>
        </>
      }
    >
      <form
        id="transaction-form"
        action={formAction}
        className="flex flex-col gap-4"
      >
        {state.error && (
          <Alert tone="danger" title="Couldn't save the transaction">
            {state.error}
          </Alert>
        )}

        {isEdit && <input type="hidden" name="id" value={transaction?.id ?? ""} />}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" required htmlFor="tx-date">
            <Input
              id="tx-date"
              name="date"
              type="date"
              required
              defaultValue={transaction?.date ?? new Date().toISOString().slice(0, 10)}
            />
          </Field>
          <Field label="Type" required htmlFor="tx-type">
            <Select
              id="tx-type"
              name="type"
              required
              value={type}
              onChange={(e) =>
                setType(e.target.value as TransactionFormValues["type"])
              }
            >
              {Object.entries(TRANSACTION_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Description" required htmlFor="tx-description">
          <Input
            id="tx-description"
            name="description"
            placeholder="e.g. Stripe payout"
            required
            defaultValue={transaction?.description}
          />
        </Field>

        <Field
          label="Amount"
          required
          htmlFor="tx-amount"
          hint="Positive number only — the transaction type decides income or expense."
        >
          <Input
            id="tx-amount"
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            required
            defaultValue={transaction?.amount}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Account" htmlFor="tx-account" hint="Optional for now.">
            <Select id="tx-account" name="accountId" defaultValue={transaction?.accountId ?? ""}>
              <option value="">No account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Category" htmlFor="tx-category">
            <Select
              id="tx-category"
              name="categoryId"
              defaultValue={transaction?.categoryId ?? ""}
              disabled={type === "transfer"}
            >
              {type === "transfer" ? (
                <option value="">Transfers don&apos;t use categories</option>
              ) : (
                <>
                  <option value="">No category</option>
                  {availableCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </>
              )}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Reference" htmlFor="tx-reference">
            <Input
              id="tx-reference"
              name="reference"
              placeholder="Optional ref or receipt number"
              defaultValue={transaction?.reference ?? ""}
            />
          </Field>
          <Field label="Notes" htmlFor="tx-notes">
            <Input
              id="tx-notes"
              name="notes"
              placeholder="Optional internal note"
              defaultValue={transaction?.notes ?? ""}
            />
          </Field>
        </div>
      </form>
    </Modal>
  );
}