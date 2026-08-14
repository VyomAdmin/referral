"use server";

import { AuthError } from "next-auth";
import { signIn } from "../../lib/auth";

export async function authenticate(_prevState: string | undefined, formData: FormData) {
  try {
    await signIn("credentials", { ...Object.fromEntries(formData), redirectTo: "/admin" });
  } catch (error) {
    if (error instanceof AuthError) {
      return "Invalid email, password, or authentication code.";
    }
    throw error;
  }
}
