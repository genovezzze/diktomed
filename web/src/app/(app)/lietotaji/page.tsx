import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/layout/page-header";
import { UsersClient } from "./users-client";

export const metadata = { title: "Lietotāji" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const admin = await requireUser(["ADMIN"]);
  const users = await prisma.user.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, role: true, active: true, mustChangePassword: true, createdAt: true },
  });

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Lietotāji"
        description="Kontus izsniedz administrators. Jauns lietotājs saņem pagaidu paroli un pirmajā pieslēgšanās reizē izvēlas savu. Atslēgts konts zaudē piekļuvi uzreiz."
      />
      <UsersClient users={users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }))} currentUserId={admin.userId} />
    </div>
  );
}
