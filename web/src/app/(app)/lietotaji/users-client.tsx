"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, KeyRound, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDateLV } from "@/lib/format";
import { APPLE_CARD_LABEL, APPLE_SEPARATOR, CHIP_GROUP, METRIC_SURFACE, TINT_TILE, chipClass } from "@/components/dashboard/apple";
import { createUser, resetPassword, setActive, setRole, type UserActionResult } from "./actions";

type Role = "ADMIN" | "TRANSCRIBER" | "DOCTOR";
const ROLES: { value: Role; label: string }[] = [
  { value: "TRANSCRIBER", label: "Diktātu speciālists" },
  { value: "DOCTOR", label: "Ārsts" },
  { value: "ADMIN", label: "Administrators" },
];

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
};

const pill =
  "inline-flex h-7 items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3 text-[13px] font-medium transition-colors hover:bg-black/[0.03] disabled:opacity-50 dark:border-white/[0.1] dark:bg-white/[0.04] dark:hover:bg-white/[0.08]";

export function UsersClient({ users, currentUserId }: { users: UserRow[]; currentUserId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ name: string; email: string; password: string } | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setNewRole] = useState<Role>("TRANSCRIBER");

  function run(action: () => Promise<UserActionResult>, onPassword?: (password: string) => void) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) return setError(res.error);
      if (res.password && onPassword) onPassword(res.password);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <section className={cn(METRIC_SURFACE, "p-5")}>
        <div className={cn(APPLE_CARD_LABEL, TINT_TILE.blue)}>
          <UserPlus />
          Jauns lietotājs
        </div>
        <form
          className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] lg:items-center"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => createUser({ name, email, role }),
              (password) => {
                setIssued({ name, email, password });
                setName("");
                setEmail("");
              },
            );
          }}
        >
          <label htmlFor="new-name" className="sr-only">Vārds, uzvārds</label>
          <Input id="new-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Vārds, uzvārds" required className="h-10" />
          <label htmlFor="new-email" className="sr-only">E-pasts</label>
          <Input id="new-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-pasts" required className="h-10" />
          <div className={CHIP_GROUP} data-slot="segmented" role="radiogroup" aria-label="Loma">
            {ROLES.map((r) => (
              <button
                key={r.value}
                type="button"
                role="radio"
                aria-checked={role === r.value}
                data-state={role === r.value ? "active" : "inactive"}
                onClick={() => setNewRole(r.value)}
                className={chipClass(role === r.value)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <Button type="submit" disabled={pending} className="h-10 px-5">
            Izveidot
          </Button>
        </form>

        {issued && (
          <div className="mt-4 rounded-xl border border-[#0A84FF]/30 bg-[#0A84FF]/[0.08] p-4 text-[14px]">
            <div className="font-medium">Pagaidu parole lietotājam {issued.name} ({issued.email})</div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <code className="rounded-lg bg-black/[0.06] px-3 py-1.5 font-mono text-[16px] tracking-wide dark:bg-white/[0.08]">{issued.password}</code>
              <button type="button" className={pill} onClick={() => void navigator.clipboard?.writeText(issued.password)}>
                <Copy className="h-3 w-3" />
                Kopēt
              </button>
            </div>
            <p className="mt-2 text-muted-foreground">
              Parole redzama tikai tagad. Nododiet to personīgi; pirmajā pieslēgšanās reizē lietotājs to nomainīs uz savu.
            </p>
          </div>
        )}
        {error && <p role="alert" className="mt-3 text-[14px] text-[#FF453A]">{error}</p>}
      </section>

      <section className={cn(METRIC_SURFACE, "overflow-hidden")}>
        <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_200px_120px_260px] gap-4 px-5 py-3 text-[13px] text-muted-foreground lg:grid">
          <span>Lietotājs</span>
          <span>Loma</span>
          <span>Statuss</span>
          <span>Izveidots</span>
          <span />
        </div>
        <ul>
          {users.map((u) => {
            const self = u.id === currentUserId;
            return (
              <li
                key={u.id}
                className={cn(
                  "grid grid-cols-1 items-center gap-x-4 gap-y-2 border-t px-5 py-3.5 text-[14px] lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_200px_120px_260px]",
                  APPLE_SEPARATOR,
                  !u.active && "opacity-60",
                )}
              >
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-medium">
                    {u.name}
                    {self && <span className="ml-2 text-[13px] font-normal text-muted-foreground">(jūs)</span>}
                  </div>
                  <div className="truncate text-[13px] text-muted-foreground">{u.email}</div>
                </div>
                <div>
                  {self ? (
                    <span>{ROLES.find((r) => r.value === u.role)?.label}</span>
                  ) : (
                    <select
                      aria-label={`Loma: ${u.name}`}
                      value={u.role}
                      disabled={pending}
                      onChange={(e) => run(() => setRole({ userId: u.id, role: e.target.value }))}
                      className="h-8 rounded-lg border border-black/[0.08] bg-transparent px-2 text-[14px] dark:border-white/[0.1] dark:bg-white/[0.04]"
                    >
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value} className="bg-card">
                          {r.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant={u.active ? "success" : "muted"}>{u.active ? "Aktīvs" : "Atslēgts"}</Badge>
                  {u.mustChangePassword && <Badge variant="warning">Pagaidu parole</Badge>}
                </div>
                <span className="text-[13px] text-muted-foreground">{formatDateLV(u.createdAt)}</span>
                <div className="flex flex-wrap gap-1.5 lg:justify-end">
                  {!self && (
                    <>
                      <button
                        type="button"
                        className={pill}
                        disabled={pending}
                        onClick={() => {
                          if (window.confirm(`Izsniegt jaunu pagaidu paroli lietotājam ${u.name}? Vecā parole vairs nedarbosies.`)) {
                            run(() => resetPassword({ userId: u.id }), (password) => setIssued({ name: u.name, email: u.email, password }));
                          }
                        }}
                      >
                        <KeyRound className="h-3 w-3" />
                        Jauna parole
                      </button>
                      <button type="button" className={pill} disabled={pending} onClick={() => run(() => setActive({ userId: u.id, active: !u.active }))}>
                        {u.active ? "Atslēgt" : "Ieslēgt"}
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
