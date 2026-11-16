"use server";
import { redirect } from "next/navigation";
import { signInAs, signOut } from "@/lib/auth";
import { DEMO_MEMBER_ID, DEMO_STAFF_ID } from "@/lib/seed";

export async function loginAs(formData: FormData) {
  const role = formData.get("role");
  if (role === "staff") {
    await signInAs(DEMO_STAFF_ID);
    redirect("/staff");
  }
  await signInAs(DEMO_MEMBER_ID);
  redirect("/");
}

export async function logout() {
  await signOut();
  redirect("/login");
}
