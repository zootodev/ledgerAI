"use client";

import * as React from "react";
import {
  DollarSign,
  ArrowUpRight,
  Upload,
  MoreHorizontal,
  FileText,
  Inbox,
} from "lucide-react";import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Modal } from "@/components/ui/modal";
import { Drawer } from "@/components/ui/drawer";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import { Tooltip } from "@/components/ui/tooltip";
import { Tabs } from "@/components/ui/tabs";
import { Accordion } from "@/components/ui/accordion";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/use-toast";
import { LineChart } from "@/components/charts/line-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { AreaChart } from "@/components/charts/area-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { AppShell } from "@/components/layout/app-shell";

const TRANSACTIONS = [
  { id: "1", date: "2026-08-01", description: "Customer payment", amount: "+₦250,000", category: "Sales", type: "income" },
  { id: "2", date: "2026-08-02", description: "Inventory restock", amount: "-₦80,500", category: "Inventory", type: "expense" },
  { id: "3", date: "2026-08-03", description: "Meta ads", amount: "-₦25,000", category: "Marketing", type: "expense" },
  { id: "4", date: "2026-08-04", description: "Delivery partner", amount: "-₦12,400", category: "Transportation", type: "expense" },
  { id: "5", date: "2026-08-05", description: "Shop rent", amount: "-₦100,000", category: "Rent", type: "expense" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="border-b border-border pb-2 text-sm font-semibold uppercase tracking-wide text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl space-y-10 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Design System</h1>
        <p className="mt-1 text-muted">
          Reusable UI foundation for LedgerAI. Components are interactive and shareable across phases.
        </p>
      </div>
      {children}
    </div>
  );
}

export function DesignShowcase() {
  const [modalOpen, setModalOpen] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [emailTouched, setEmailTouched] = React.useState(false);
  const [businessType, setBusinessType] = React.useState("");
  const { notify } = useToast();

  const emailInvalid = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const emailError =
    emailTouched && (email.length === 0 || emailInvalid)
      ? "Please enter a valid email."
      : undefined;

  const columns: Column<(typeof TRANSACTIONS)[number]>[] = [
    { key: "date", header: "Date", sortValue: (r) => r.date, cell: (r) => <span className="tabular-nums">{r.date}</span> },
    { key: "description", header: "Description", cell: (r) => <span className="font-medium">{r.description}</span> },
    { key: "category", header: "Category", cell: (r) => <Badge tone={r.type === "income" ? "success" : "default"}>{r.category}</Badge> },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      sortValue: (r) => r.amount,
      cell: (r) => (
        <span className={r.amount.startsWith("+") ? "text-success" : "text-danger"}>
          {r.amount}
        </span>
      ),
    },
  ];

  return (
    <AppShell
      header={{
        title: "Design System",
        user: { name: "Ngozi A.", email: "ngozi@example.com" },
      }}
    >
      <Layout>
        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="dangerOutline">Danger outline</Button>
            <Button variant="link">Link</Button>
            <Button loading>Loading</Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
            <Button disabled>Disabled</Button>
            <Button leftIcon={<Upload className="h-4 w-4" />}>Import</Button>
          </div>
        </Section>

        <Section title="Forms">
          <div className="grid gap-5 rounded-card border border-border bg-surface p-5 sm:grid-cols-2">
            <Field label="Business name" required htmlFor="field-name">
              <Input id="field-name" placeholder="Zooto Fashion Store" />
            </Field>
            <Field label="Business type">
              <Select value={businessType} onChange={(e) => setBusinessType(e.target.value)} placeholder="Select type">
                <option value="retail">Retail & e‑commerce</option>
                <option value="service">Professional services</option>
                <option value="food">Food & beverage</option>
                <option value="fashion">Fashion & apparel</option>
                <option value="agency">Agency & creative</option>
                <option value="freelance">Freelance / solo</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Email" error={emailError}>
              <Input
                id="field-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setEmailTouched(true)}
                invalid={!!emailError}
                placeholder="you@example.com"
              />
            </Field>
            <Field label="Base currency">
              <Select defaultValue="NGN">
                <option value="NGN">NGN — Nigerian Naira</option>
                <option value="USD">USD — US Dollar</option>
                <option value="GHS">GHS — Ghanaian Cedi</option>
              </Select>
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <Textarea placeholder="Add a note about this business…" />
            </Field>
            <div className="flex flex-col gap-3 sm:col-span-2">
              <Checkbox label="Enable automatic categorization" />
              <Switch checked={true} onCheckedChange={() => {}} label="Send weekly summary email" />
            </div>
          </div>
        </Section>

        <Section title="Badges">
          <div className="flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge tone="brand">Brand</Badge>
            <Badge tone="success">Success</Badge>
            <Badge tone="warning">Warning</Badge>
            <Badge tone="danger">Danger</Badge>
            <Badge tone="info">Info</Badge>
            <Badge tone="brand" variant="solid">Solid</Badge>
            <Badge tone="success" variant="outline">Outline</Badge>
          </div>
        </Section>

        <Section title="Cards & Stats">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Revenue" value="₦1.2M" delta="+12.5%" icon={<DollarSign className="h-4.5 w-4.5" />} />
            <StatCard label="Expenses" value="₦840K" delta="-4.2%" icon={<ArrowUpRight className="h-4.5 w-4.5" />} />
            <StatCard label="Net profit" value="₦360K" delta="+18%" />
            <StatCard label="Margin" value="30%" hint="vs 26% last month" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Sample card</CardTitle>
                <CardDescription>Cards hold grouped content with a title, body, and optional footer.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-secondary">
                  Card body content goes here. Consistent padding, borders, and shadow across every card.
                </p>
              </CardContent>
              <CardFooter className="justify-end">
                <Button variant="outline" size="sm">Cancel</Button>
                <Button size="sm">Save</Button>
              </CardFooter>
            </Card>

            <Card className="flex flex-col p-5">
              <CardTitle className="mb-4">Interactive panel</CardTitle>
              <div className="flex items-center justify-between rounded-card border border-border p-3">
                <span className="text-sm text-secondary">Hover me for a tooltip</span>
                <Tooltip content="This is a tooltip">
                  <Badge tone="info">Hover</Badge>
                </Tooltip>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm text-muted">Open menu</span>
                <Dropdown
                  trigger={<Button variant="outline" size="sm"><MoreHorizontal className="h-4 w-4" /></Button>}
                >
                  <DropdownItem icon={<FileText className="h-4 w-4" />}>View details</DropdownItem>
                  <DropdownItem icon={<Upload className="h-4 w-4" />}>Export</DropdownItem>
                  <DropdownItem destructive>Delete</DropdownItem>
                </Dropdown>
              </div>
            </Card>
          </div>
        </Section>

        <Section title="Dialogs">
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setModalOpen(true)}>Open modal</Button>
            <Button variant="outline" onClick={() => setDrawerOpen(true)}>Open drawer</Button>
          </div>
        </Section>

        <Section title="Tabs & Accordion">
          <Tabs
            ariaLabel="Example tabs"
            value="all"
            onChange={() => {}}
            items={[
              { value: "all", label: "All" },
              { value: "income", label: "Income" },
              { value: "expenses", label: "Expenses" },
              { value: "transfers", label: "Transfers" },
            ]}
          />
          <Accordion
            items={[
              { value: "a", title: "What is LedgerAI?", children: "AI-powered financial intelligence for small businesses." },
              { value: "b", title: "Is my data secure?", children: "Yes. Financial data is treated as highly sensitive." },
            ]}
          />
        </Section>

        <Section title="Table">
          <DataTable
            columns={columns}
            data={TRANSACTIONS}
            rowKey={(r) => r.id}
            empty={<EmptyState icon={<Inbox className="h-6 w-6" />} title="No transactions" description="Import or add your first transaction." />}
          />
          <p className="text-sm text-muted">Sortable columns: click Date, Description, or Amount headers.</p>
        </Section>

        <Section title="Charts">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Revenue trend</CardTitle></CardHeader>
              <CardContent>
                <AreaChart
                  xKey="month"
                  height={220}
                  data={[
                    { month: "Mar", revenue: 420000 },
                    { month: "Apr", revenue: 510000 },
                    { month: "May", revenue: 480000 },
                    { month: "Jun", revenue: 620000 },
                    { month: "Jul", revenue: 590000 },
                    { month: "Aug", revenue: 720000 },
                  ]}
                  series={[{ key: "revenue", name: "Revenue" }]}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Income vs expenses</CardTitle></CardHeader>
              <CardContent>
                <BarChart
                  xKey="month"
                  height={220}
                  data={[
                    { month: "Jun", income: 620000, expenses: 410000 },
                    { month: "Jul", income: 590000, expenses: 460000 },
                    { month: "Aug", income: 720000, expenses: 430000 },
                  ]}
                  series={[
                    { key: "income", name: "Income" },
                    { key: "expenses", name: "Expenses" },
                  ]}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Cash flow</CardTitle></CardHeader>
              <CardContent>
                <LineChart
                  xKey="week"
                  height={220}
                  data={[
                    { week: "W1", flow: 120000 },
                    { week: "W2", flow: 150000 },
                    { week: "W3", flow: 98000 },
                    { week: "W4", flow: 175000 },
                  ]}
                  series={[{ key: "flow", name: "Net flow" }]}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Expense breakdown</CardTitle></CardHeader>
              <CardContent>
                <DonutChart
                  height={220}
                  centerLabel={{ value: "₦840K", caption: "Total expenses" }}
                  data={[
                    { name: "Inventory", value: 38 },
                    { name: "Marketing", value: 22 },
                    { name: "Rent", value: 18 },
                    { name: "Transportation", value: 12 },
                    { name: "Other", value: 10 },
                  ]}
                />
              </CardContent>
            </Card>
          </div>
        </Section>

        <Section title="Feedback & states">
          <div className="grid gap-3">
            <Alert tone="info" title="Heads up">A new import is available for review.</Alert>
            <Alert tone="success" title="Import complete">184 transactions imported, 8 flagged for review.</Alert>
            <Alert tone="warning" title="Low confidence">Some transactions need review before saving.</Alert>
            <Alert tone="danger" title="Upload failed" onDismiss={() => {}}>The file format wasn’t recognized. Try CSV or XLSX.</Alert>
            <div className="flex flex-wrap items-center gap-4 rounded-card border border-border bg-surface p-4">
              <Spinner />
              <Skeleton className="w-48" height={16} />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="w-full" height={14} />
                <Skeleton className="w-2/3" height={14} />
              </div>
            </div>
            <EmptyState
              icon={<Upload className="h-6 w-6" />}
              title="Import your first statement"
              description="Upload a CSV, XLSX, or PDF statement to get started."
              action={<Button>Import transactions</Button>}
            />
            <ErrorState onRetry={() => {}} />
          </div>
        </Section>

        <Section title="Notifications">
          <Button
            variant="outline"
            onClick={() =>
              notify("success", {
                title: "Saved",
                description: "Your changes were saved successfully.",
              })
            }
          >
            Show success toast
          </Button>
          <Button
            variant="outline"
            className="ml-2"
            onClick={() =>
              notify("danger", {
                title: "Error",
                description: "Something went wrong. Please try again.",
              })
            }
          >
            Show error toast
          </Button>
        </Section>
      </Layout>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add transaction"
        description="Record a new income or expense."
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={() => setModalOpen(false)}>Save</Button>
          </>
        }
      >
        <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
          <Field label="Description" required>
            <Input placeholder="e.g. Customer payment" />
          </Field>
          <Field label="Amount" required>
            <Input type="number" placeholder="0.00" />
          </Field>
          <Field label="Category">
            <Select defaultValue="">
              <option value="" disabled>Select category</option>
              <option value="sales">Sales</option>
              <option value="inventory">Inventory</option>
              <option value="marketing">Marketing</option>
            </Select>
          </Field>
        </form>
      </Modal>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Transaction details"
        description="Review and correct a transaction."
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-card border border-border p-4">
            <span className="text-sm text-muted">Amount</span>
            <span className="text-lg font-semibold text-success tabular-nums">+₦250,000</span>
          </div>
          <p className="text-sm text-secondary">
            This panel is used for detail views, e.g. transaction inspection. Content here will be
            populated with real data in later phases.
          </p>
          <Button fullWidth onClick={() => setDrawerOpen(false)}>Close</Button>
        </div>
      </Drawer>
    </AppShell>
  );
}
