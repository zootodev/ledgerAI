"use client";

import * as React from "react";
import { useActionState } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  completeOnboardingAction,
  type OnboardingActionState,
} from "@/lib/actions/onboarding";
import {
  BUSINESS_SIZES,
  BUSINESS_TYPES,
  COUNTRIES,
  CURRENCIES,
} from "@/lib/validation/business";

const initialState: OnboardingActionState = {};

export interface OnboardingFormDefaults {
  name: string;
  country: string;
  currency: string;
}

export interface OnboardingFormProps {
  defaults: OnboardingFormDefaults;
}

/** Two-step first-run setup: business identity, then location and scale. */
export function OnboardingForm({ defaults }: OnboardingFormProps) {
  const [state, formAction, pending] = useActionState(
    completeOnboardingAction,
    initialState,
  );
  const [step, setStep] = React.useState(1);
  const [stepError, setStepError] = React.useState<string | null>(null);

  const nameRef = React.useRef<HTMLInputElement>(null);
  const typeRef = React.useRef<HTMLSelectElement>(null);

  // Step 1 must be complete before step 2 (and its submit button) appear.
  const advance = () => {
    const name = nameRef.current?.value.trim() ?? "";
    const type = typeRef.current?.value ?? "";
    if (name === "") {
      setStepError("Business name is required.");
      nameRef.current?.focus();
      return;
    }
    if (type === "") {
      setStepError("Choose what your business does.");
      typeRef.current?.focus();
      return;
    }
    setStepError(null);
    setStep(2);
  };

  const error = state.error ?? stepError;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Set up your business</CardTitle>
            <CardDescription>
              {step === 1
                ? "Tell LedgerAI what you do — this takes under a minute."
                : "Where you operate and how big you are. You can change everything later in Settings."}
            </CardDescription>
          </div>
          <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted">
            Step {step} of 2
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {error && (
            <Alert tone="danger" title="We couldn't finish setup">
              {error}
            </Alert>
          )}

          {/* Step 1 — identity (kept mounted so values survive step changes) */}
          <div className={step === 1 ? "space-y-4" : "hidden"}>
            <Field label="Business name" required htmlFor="onboarding-name">
              <Input
                id="onboarding-name"
                ref={nameRef}
                name="name"
                type="text"
                defaultValue={defaults.name}
                placeholder="Zooto Fashion"
                required
                autoFocus
              />
            </Field>
            <Field
              label="What does the business do?"
              required
              htmlFor="onboarding-type"
            >
              <Select
                id="onboarding-type"
                ref={typeRef}
                name="type"
                defaultValue=""
                required
              >
                <option value="" disabled>
                  Select a type
                </option>
                {BUSINESS_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {/* Step 2 — location and scale */}
          <div className={step === 2 ? "space-y-4" : "hidden"}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Country" htmlFor="onboarding-country">
                <Select
                  id="onboarding-country"
                  name="country"
                  defaultValue={defaults.country}
                >
                  {COUNTRIES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Currency" htmlFor="onboarding-currency">
                <Select
                  id="onboarding-currency"
                  name="currency"
                  defaultValue={defaults.currency}
                >
                  {CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field
              label="How many people?"
              htmlFor="onboarding-size"
              hint="Used to tailor insights to a business your size."
            >
              <Select id="onboarding-size" name="size" defaultValue="">
                <option value="">Prefer not to say</option>
                {BUSINESS_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Goals (optional)"
              htmlFor="onboarding-goals"
              hint="One per line — e.g. Know my real profit, Stop losing receipts."
            >
              <Textarea
                id="onboarding-goals"
                name="goals"
                rows={3}
                placeholder={"Know my real profit\nStop losing receipts"}
              />
            </Field>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <div>
              {step === 2 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setStepError(null);
                    setStep(1);
                  }}
                  disabled={pending}
                  leftIcon={<ArrowLeft className="h-4 w-4" />}
                >
                  Back
                </Button>
              )}
            </div>
            {step === 1 ? (
              <Button
                type="button"
                onClick={advance}
                rightIcon={<ArrowRight className="h-4 w-4" />}
              >
                Continue
              </Button>
            ) : (
              <Button
                type="submit"
                loading={pending}
                leftIcon={<Check className="h-4 w-4" />}
              >
                Open my dashboard
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
