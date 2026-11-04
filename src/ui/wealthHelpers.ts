import { toast } from "sonner";
import { errorMessages } from "./form";

export async function runAction(fn: () => Promise<unknown>, msg: string) {
  try {
    await fn();
    toast.success(msg);
  } catch (e) {
    toast.error(errorMessages(e)[0]);
  }
}

export const fmtDate = (d: string) => d.split("-").reverse().join("/");

export const meta = (title: string, description: string) => ({
  meta: [
    { title: `${title} — Finanças` },
    { name: "description", content: description },
    { property: "og:title", content: `${title} — Finanças` },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ],
});
