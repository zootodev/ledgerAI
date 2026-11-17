"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { deleteCategoryRuleAction } from "@/lib/actions/rules";
import type { CategoryRuleDto } from "@/types";
import { countPhrase } from "@/lib/utils/pluralise";

export interface RulesManagerProps {
  rules: CategoryRuleDto[];
}

export function RulesManager({ rules }: RulesManagerProps) {
  const router = useRouter();
  const [deleting, setDeleting] = React.useState<CategoryRuleDto | null>(null);
  const [pending, setPending] = React.useState(false);

  const handleDelete = async () => {
    if (!deleting) return;
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("id", deleting.id);
      await deleteCategoryRuleAction(fd);
      setDeleting(null);
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Rules</CardTitle>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <EmptyState
              title="No rules yet"
              description="Rules appear here when you correct a category during an import."
            />
          ) : (
            <>
              <div className="mb-3 flex flex-wrap justify-between gap-2 text-sm text-muted">
                <span>{countPhrase(rules.length, "rule")}</span>
                <span>Rules are learned from your category corrections</span>
              </div>
              <ul className="divide-y divide-border border-t border-border">
                {rules.map((rule) => (
                  <li
                    key={rule.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="font-mono text-sm font-semibold text-foreground">
                        {rule.pattern.toUpperCase()}
                      </p>
                      <Badge tone="info">Merchant</Badge>
                      <Badge tone="default">Learned</Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge tone={rule.categoryId ? "success" : "default"} variant="outline">
                        {rule.categoryName || "Uncategorised"}
                      </Badge>
                      <span className="text-xs tabular-nums text-muted">
                        {rule.createdAt.slice(0, 10)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete rule for ${rule.pattern.toUpperCase()}`}
                        onClick={() => setDeleting(rule)}
                      >
                        <Trash2 className="h-4 w-4 text-danger" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        pending={pending}
        title="Delete rule?"
        description={
          deleting
            ? `Categorisation for this pattern will fall back to the built-in rules.`
            : undefined
        }
      />
    </>
  );
}
