import Link from "next/link";
import { LogoLockup } from "@/components/brand/logo";
import { requireUser } from "@/lib/auth";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Parole" };
export const dynamic = "force-dynamic";

export default async function PasswordPage() {
  const session = await requireUser(undefined, { allowTemporaryPassword: true });
  return (
    <div className="dark flex min-h-[100svh] items-center justify-center bg-black px-5 py-8 text-foreground">
      <div className="w-full max-w-[27rem]">
        <div className="mx-auto mb-7 w-fit text-white">
          <LogoLockup />
        </div>
        <div className="mb-5 text-center">
          <h1 className="font-accent text-[1.6rem] font-bold leading-tight text-white">
            {session.mustChangePassword ? "Izvēlieties savu paroli" : "Mainīt paroli"}
          </h1>
          <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-5 text-white/45">
            {session.mustChangePassword
              ? `${session.name}, jums izsniegta pagaidu parole. Pirms darba nomainiet to uz savu.`
              : "Parolei jābūt vismaz 12 rakstzīmes garai, ar burtiem un cipariem."}
          </p>
        </div>
        <PasswordForm />
        {!session.mustChangePassword && (
          <p className="mt-6 text-center text-sm">
            <Link href="/" className="text-white/50 hover:text-white">Atpakaļ</Link>
          </p>
        )}
      </div>
    </div>
  );
}
