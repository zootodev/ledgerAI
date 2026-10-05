"use client";

import * as React from "react";
import { useActionState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import {
  updateBusinessAction,
  type SettingsActionState,
} from "@/lib/actions/business";
import {
  BUSINESS_SIZES,
  BUSINESS_TYPES,
  COUNTRIES,
  CURRENCIES,
} from "@/lib/validation/business";
import type { BusinessServiceData } from "@/lib/services/business";

const initialState: SettingsActionState = {};

export interface BusinessSettingsProps {
  business: BusinessServiceData;
}

function CountryOption({ code }: { code: string }) {
  return <option value={code}>{code}</option>;
}

export function BusinessSettings({ business }: BusinessSettingsProps) {
  const [state, formAction, pending] = useActionState(
    updateBusinessAction,
    initialState,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Business</CardTitle>
        <CardDescription>
          Basic profile for your organisation. This drives defaults across the
          app, including the currency used in the ledger.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="max-w-md space-y-4">
          {state.error && (
            <Alert tone="danger" title="Couldn't save business settings">
              {state.error}
            </Alert>
          )}
          {state.ok && (
            <Alert tone="success" title="Business settings updated">
              Your changes have been saved.
            </Alert>
          )}

          <Field label="Business name" required htmlFor="business-name">
            <Input
              id="business-name"
              name="name"
              type="text"
              defaultValue={business.name}
              placeholder="Zooto Fashion"
              required
            />
          </Field>

          <Field label="What does the business do?" htmlFor="business-type">
            <Select id="business-type" name="type" defaultValue={business.type ?? ""}>
              <option value="">Select a type</option>
              {BUSINESS_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Country" htmlFor="business-country">
              <Select id="business-country" name="country" defaultValue={business.country}>
                {COUNTRIES.map((code) => (
                  <CountryOption key={code} code={code} />
                ))}
              </Select>
            </Field>
            <Field label="Currency" htmlFor="business-currency">
              <Select id="business-currency" name="currency" defaultValue={business.currency}>
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="How many people?" htmlFor="business-size">
            <Select id="business-size" name="size" defaultValue={business.size ?? ""}>
              <option value="">Select a range</option>
              {BUSINESS_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </Select>
          </Field>

          <div className="pt-1">
            <Button type="submit" loading={pending}>
              Save business settings
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}