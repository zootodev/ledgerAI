"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { FolderOpen, Lock, Pencil, Plus, Trash2 } from "lucide-react";
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
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
  type CategoryActionState,
} from "@/lib/actions/categories";
import { TRANSACTION_TYPE_LABELS } from "@/lib/validation/transaction";
import type { CategoryServiceData } from "@/lib/services/categories";

export interface CategoriesManagerProps {
  categories: CategoryServiceData[];
}

export function CategoriesManager({ categories }: CategoriesManagerProps) {
  const router = useRouter();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [defaultType, setDefaultType] = React.useState<"income" | "expense">("expense");
  const [deleting, setDeleting] = React.useState<CategoryServiceData | null>(null);

  const editing =
    editId === null ? null : categories.find((c) => c.id === editId) ?? null;

  const customCount = categories.filter((c) => !c.isSystem).length;

  const openCreate = (type: "income" | "expense") => {
    setDefaultType(type);
    setEditId(null);
    setFormOpen(true);
  };

  const openEdit = (category: CategoryServiceData) => {
    if (category.isSystem) return;
    setDefaultType(category.type);
    setEditId(category.id);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const fd = new FormData();
    fd.set("id", deleting.id);
    await deleteCategoryAction(fd);
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
          <CardTitle>Categories</CardTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => openCreate("income")} leftIcon={<Plus className="h-3.5 w-3.5" />}>
              Income
            </Button>
            <Button size="sm" onClick={() => openCreate("expense")} leftIcon={<Plus className="h-3.5 w-3.5" />}>
              Expense
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <EmptyState
              icon={<FolderOpen className="h-6 w-6" />}
              title="No categories yet"
              description="Categories group imported and manual transactions for clean reports."
              action={
                <Button onClick={() => openCreate("expense")} leftIcon={<Plus className="h-4 w-4" />}>
                  Add a category
                </Button>
              }
            />
          ) : (
            <>
              <div className="mb-3 flex flex-wrap justify-between gap-2 text-sm text-muted">
                <span>{categories.length} categories</span>
                <span>{customCount} custom · built-ins are read-only</span>
              </div>
              <ul className="space-y-2">
                {categories.map((category) => (
                  <li
                    key={category.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-field border border-border bg-surface-subtle/40 px-3 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <FolderOpen className="h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
                      <p className="font-medium text-foreground">{category.name}</p>
                      {category.isSystem && (
                        <Badge tone="default">
                          <Lock className="h-3 w-3" aria-hidden="true" />
                          Built-in
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge tone={category.type === "income" ? "success" : "info"}>
                        {TRANSACTION_TYPE_LABELS[category.type]}
                      </Badge>
                      {!category.isSystem && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Edit ${category.name}`}
                            onClick={() => openEdit(category)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete ${category.name}`}
                            onClick={() => setDeleting(category)}
                          >
                            <Trash2 className="h-4 w-4 text-danger" />
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      {formOpen && (
        <CategoryFormModal
          key={editId ?? "new"}
          editing={editing}
          defaultType={defaultType}
          onClose={() => setFormOpen(false)}
          onSaved={handleSaved}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Delete category?"
        description={
          deleting
            ? `"${deleting.name}" will be removed. Transactions with this category will fall back to uncategorized.`
            : undefined
        }
      />
    </>
  );
}

interface CategoryFormModalProps {
  editing: CategoryServiceData | null;
  defaultType: "income" | "expense";
  onClose: () => void;
  onSaved: () => void;
}

const initialState: CategoryActionState = {};

function CategoryFormModal({
  editing,
  defaultType,
  onClose,
  onSaved,
}: CategoryFormModalProps) {
  const action = editing ? updateCategoryAction : createCategoryAction;
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
      title={editing ? "Edit category" : "Add category"}
      description="Used by the automatic categorizer and import suggestions."
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="category-form" loading={pending}>
            {editing ? "Save changes" : "Add category"}
          </Button>
        </>
      }
    >
      <form id="category-form" action={formAction} className="flex flex-col gap-4">
        {state.error && (
          <Alert tone="danger" title="Couldn't save the category">
            {state.error}
          </Alert>
        )}

        {editing && <input type="hidden" name="id" value={editing.id} />}

        <Field label="Name" required htmlFor="category-name">
          <Input
            id="category-name"
            name="name"
            placeholder="e.g. Fuel & tolls"
            required
            maxLength={60}
            defaultValue={editing?.name}
          />
        </Field>
        <Field label="Type" required htmlFor="category-type">
          <Select
            id="category-type"
            name="type"
            defaultValue={editing?.type ?? defaultType}
          >
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </Select>
        </Field>
      </form>
    </Modal>
  );
}