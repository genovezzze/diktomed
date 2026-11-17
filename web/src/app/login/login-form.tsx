"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { loginAction } from "./actions";

// Field and button skins from the Shadowy login screen.
const fieldClass =
  "auth-field h-11 rounded-lg border-white/[0.17] !bg-black px-4 font-accent text-base tracking-[0.01em] text-white shadow-none placeholder:text-white/48 focus-visible:border-white/35 focus-visible:ring-1 focus-visible:ring-white/15 focus-visible:ring-offset-0 sm:text-sm";
const primaryClass =
  "h-11 w-full rounded-lg border border-white !bg-white font-accent text-sm font-bold tracking-[0.02em] !text-black shadow-none hover:!bg-white/90";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const rawNext = params.get("next");
  // Same-origin paths only, so the login page cannot become an open redirect.
  const nextPath = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await loginAction(formData);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        router.push(nextPath);
        router.refresh();
      } catch {
        setError("Pieslēgšanās īslaicīgi nav pieejama. Mēģiniet vēlreiz pēc brīža.");
      }
    });
  }

  return (
    <form action={onSubmit} className="space-y-3">
      <label htmlFor="email" className="sr-only">E-pasts</label>
      <Input id="email" name="email" type="email" autoComplete="username" required placeholder="E-pasts" className={fieldClass} />
      <label htmlFor="password" className="sr-only">Parole</label>
      <Input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        placeholder="Parole"
        className={fieldClass}
      />
      {error ? (
        <div role="alert" className="rounded-xl border border-red-400/20 bg-red-400/[0.06] px-4 py-3 font-accent text-sm leading-5 text-red-300">
          {error}
        </div>
      ) : null}
      <Button type="submit" className={primaryClass} disabled={pending}>
        {pending ? "Pārbauda..." : "Pieslēgties"}
      </Button>
    </form>
  );
}
