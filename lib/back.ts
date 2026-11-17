import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/** After a staff action: refresh every page's data and go back with a message or error. */
export function back(path: string, params: Record<string, string>): never {
  revalidatePath("/", "layout");
  const q = new URLSearchParams(params).toString();
  redirect(q ? `${path}?${q}` : path);
}
