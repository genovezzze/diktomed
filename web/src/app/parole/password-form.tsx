"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { changePassword } from "./actions";

const fieldClass =
  "auth-field h-11 rounded-lg border-white/[0.17] !bg-black px-4 font-accent text-base text-white shadow-none placeholder:text-white/48 focus-visible:border-white/35 focus-visible:ring-1 focus-visible:ring-white/15 focus-visible:ring-offset-0 sm:text-sm";

export function PasswordForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const res = await changePassword(fd);
          if (!res.ok) return setError(res.error);
          router.push("/");
          router.refresh();
        });
      }}
      className="space-y-3"
    >
      <label htmlFor="current" className="sr-only">Pašreizējā parole</label>
      <Input id="current" name="current" type="password" autoComplete="current-password" required placeholder="Pašreizējā (pagaidu) parole" className={fieldClass} />
      <label htmlFor="next" className="sr-only">Jaunā parole</label>
      <Input id="next" name="next" type="password" autoComplete="new-password" required placeholder="Jaunā parole (vismaz 12 rakstzīmes)" className={fieldClass} />
      <label htmlFor="repeat" className="sr-only">Atkārtot jauno paroli</label>
      <Input id="repeat" name="repeat" type="password" autoComplete="new-password" required placeholder="Atkārtojiet jauno paroli" className={fieldClass} />
      {error && (
        <div role="alert" className="rounded-xl border border-red-400/20 bg-red-400/[0.06] px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}
      <Button type="submit" disabled={pending} className="h-11 w-full rounded-lg border border-white !bg-white text-sm font-bold !text-black shadow-none hover:!bg-white/90">
        {pending ? "Saglabā..." : "Saglabāt jauno paroli"}
      </Button>
    </form>
  );
}
