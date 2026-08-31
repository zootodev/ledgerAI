import type { TransactionType, ImportSource } from "../constants/categories";

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
}

export interface Business {
  id: string;
  userId: string;
  name: string;
  type?: string | null;
  country: string;
  currency: string;
  size?: string | null;
  goals: string[];
  createdAt: string;
}

export interface Account {
  id: string;
  businessId: string;
  name: string;
  institution?: string | null;
  currency: string;
}

export interface Category {
  id: string;
  businessId?: string | null;
  name: string;
  type: "income" | "expense";
  isSystem: boolean;
}

export interface Transaction {
  id: string;
  businessId: string;
  accountId?: string | null;
  date: string;
  description: string;
  amount: string; // decimal string to avoid float drift
  type: TransactionType;
  categoryId?: string | null;
  category?: Category | null;
  source: ImportSource;
  reference?: string | null;
  notes?: string | null;
  aiCategory?: string | null;
  aiConfidence?: number | null;
  fingerprint?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Result of AI categorization (always accompanied by confidence). */
export interface CategorizationResult {
  categoryName: string;
  confidence: number; // 0..1
  needsReview: boolean;
}
