import { Skeleton, SkeletonCard } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-10">
      <Skeleton className="h-8 w-56" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-48" />
        <div className="flex flex-col gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    </div>
  );
}
