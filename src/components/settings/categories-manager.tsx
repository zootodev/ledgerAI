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
import { cn } from "@/lib/utils/cn";
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
  /** Narrows the visible list; the two header buttons add rather than filter. */
  const [typeFilter, setTypeFilter] = React.useState<"all" | "income" | "expense">(
    "all",
  );

  const editing =
    editId === null ? null : categories.find((c) => c.id === editId) ?? null;

  const customCount = categories.filter((c) => !c.isSystem).length;
  const visibleCategories =
    typeFilter === "all"
      ? categories
      : categories.filter((c) => c.type === typeFilter);

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
        <CardHeader className="flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Categories</CardTitle>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Button
              size="sm"
              variant="outline"
              onClick={() => openCreate("income")}
              leftIcon={<Plus className="h-3.5 w-3.5" />}
            >
              Add income
            </Button>
            <Button
              size="sm"
              onClick={() => openCreate("expense")}
              leftIcon={<Plus className="h-3.5 w-3.5" />}
            >
              Add expense
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
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                {/* A real filter (the header buttons are add actions, renamed
                    accordingly). aria-pressed announces the active segment. */}
                <div
                  role="group"
                  aria-label="Filter categories by type"
                  className="inline-flex rounded-field border border-border-strong bg-surface p-0.5"
                >
                  {(
                    [
                      { value: "all", label: "All" },
                      { value: "income", label: "Income" },
                      { value: "expense", label: "Expense" },
                    ] as const
                  ).map((option) => {
                    const selected = typeFilter === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setTypeFilter(option.value)}
                        className={cn(
                          "rounded-[calc(var(--radius-field)-2px)] px-3 py-1.5 text-xs font-medium transition-colors",
                          selected
                            ? "bg-brand text-on-accent"
                            : "text-secondary hover:bg-surface-subtle hover:text-foreground",
                        )}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-sm text-muted">
                  {visibleCategories.length} categor
                  {visibleCategories.length === 1 ? "y" : "ies"}
                  {" · "}
                  {customCount} custom · built-ins are read-only
                </p>
              </div>
              <ul className="space-y-2">
                {visibleCategories.map((category) => (
                  <li
                    key={category.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-field border border-border bg-surface-subtle/40 px-3 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <FolderOpen className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
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
              {visibleCategories.length === 0 && (
                <p className="rounded-field border border-dashed border-border px-3 py-6 text-center text-sm text-muted">
                  No {typeFilter} categories yet.
                </p>
              )}
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
  // The type is controlled so the name hint can match it: an income category
  // is usually better exemplified by "Consulting fees" than "Fuel & tolls".
  const [categoryType, setCategoryType] = React.useState<"income" | "expense">(
    editing?.type ?? defaultType,
  );
  const namePlaceholder =
    categoryType === "income" ? "e.g. Consulting fees" : "e.g. Fuel & tolls";

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
            placeholder={namePlaceholder}
            required
            maxLength={60}
            defaultValue={editing?.name}
          />
        </Field>
        <Field label="Type" required htmlFor="category-type">
          <Select
            id="category-type"
            name="type"
            value={categoryType}
            onChange={(e) => setCategoryType(e.target.value as "income" | "expense")}
          >
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </Select>
        </Field>
      </form>
    </Modal>
  );
}