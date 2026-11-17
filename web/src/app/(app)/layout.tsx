import { AppShell } from "@/components/layout/app-shell";
import { NewDesignScope } from "@/components/layout/new-design-scope";
import { ROLE_LABELS, requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser();
  return (
    <AppShell
      role={session.role}
      roleLabel={ROLE_LABELS[session.role]}
      userName={session.name}
      organizationName={process.env.ORG_NAME ?? "Demo slimnīca"}
    >
      <NewDesignScope>{children}</NewDesignScope>
    </AppShell>
  );
}
