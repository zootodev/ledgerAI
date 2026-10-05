import { z } from "zod";

/** Profile edit input: display name is all the owner can change today. */
export const profileUpdateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Your name is required.")
    .max(120, "Your name must be 120 characters or fewer."),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;