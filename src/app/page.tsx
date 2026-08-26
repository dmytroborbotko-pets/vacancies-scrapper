import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

export default async function Home() {
  const userId = await requireUserId();

  const [vacancyCount, cvProfileCount, toApplyCount] = await Promise.all([
    prisma.vacancy.count({
      where: { discoveries: { some: { searchConfig: { cvProfile: { userId } } } } },
    }),
    prisma.cvProfile.count({ where: { userId } }),
    prisma.match.count({
      where: { status: "TO_APPLY", cvProfile: { userId } },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-4xl font-semibold">Огляд</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Вакансій знайдено" value={vacancyCount} />
        <StatCard label="CV-профілів" value={cvProfileCount} />
        <StatCard label="До подачі" value={toApplyCount} />
      </div>
      <p className="text-base text-zinc-500">
        <Link href="/vacancies" className="underline">
          Вакансії
        </Link>{" "}
        зі збігом ≥55% автоматично отримують мотиваційний лист і потрапляють
        у{" "}
        <Link href="/to-apply" className="underline">
          «До подачі»
        </Link>
        .
      </p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-sm text-zinc-500">{label}</div>
    </div>
  );
}
