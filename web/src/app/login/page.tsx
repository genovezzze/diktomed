import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
import { LogoLockup } from "@/components/brand/logo";
import { getSession } from "@/lib/auth";

export const metadata = { title: "Pierakstīties" };

export default async function LoginPage() {
  if (await getSession()) redirect("/");

  return (
    <div className="dark min-h-[100svh] bg-black text-foreground lg:grid lg:grid-cols-2">
      <main className="flex min-h-[100svh] items-center justify-center bg-black px-5 py-6 sm:px-8 sm:py-8 lg:px-10 xl:px-16">
        <div className="w-full max-w-[27rem]">
          <div className="mx-auto mb-7 w-fit text-white">
            <LogoLockup />
          </div>
          <section>
            <div className="mb-5 text-center">
              <h1 className="text-balance font-accent text-[1.6rem] font-bold leading-tight tracking-[0.01em] text-white [font-synthesis:weight] sm:text-[1.8rem]">
                Pierakstīties
              </h1>
              <p className="mx-auto mt-1.5 max-w-sm font-accent text-[13px] font-light leading-5 tracking-[0.01em] text-white/45">
                Ievadiet slimnīcas izsniegto e-pastu un paroli
              </p>
            </div>
            <Suspense fallback={<div className="text-sm text-white/40">Ielādē...</div>}>
              <LoginForm />
            </Suspense>
            <p className="mt-6 text-center font-accent text-[13px] leading-5 text-white/40">
              Dati tiek apstrādāti tikai slimnīcas serverī. Kontu izsniedz administrators.
            </p>
          </section>
        </div>
      </main>

      <aside
        aria-hidden
        className="relative my-2 mr-2 hidden min-h-[calc(100svh-1rem)] overflow-hidden rounded-md bg-neutral-950 lg:block"
      >
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_30%_25%,rgba(10,132,255,0.35),transparent_70%),radial-gradient(55%_50%_at_75%_80%,rgba(48,209,88,0.18),transparent_70%),radial-gradient(40%_40%_at_80%_20%,rgba(94,92,230,0.25),transparent_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:48px_48px]" />
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="whitespace-nowrap text-center font-display text-[clamp(4rem,7vw,8rem)] font-bold leading-none tracking-[-0.045em] text-white [font-synthesis:none] drop-shadow-[0_2px_18px_rgba(0,0,0,0.24)]">
            DiktoMed
          </span>
        </div>
      </aside>
    </div>
  );
}
