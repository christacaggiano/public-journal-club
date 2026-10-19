import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PendingReview } from "@/components/PendingReview";
import { ReviewShell } from "@/components/review/ReviewShell";
import { getReview, getStatus, isValidId } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  if (!isValidId(id)) return { title: "Review not found" };
  const status = await getStatus(id);
  if (status.state !== "done") return { title: "Review in progress", robots: { index: false } };
  const review = await getReview(id);
  if (!review) return { title: "Review not found" };
  const description = review.tldr.findings[0] ?? review.summary.slice(0, 160);
  return {
    title: review.paper.title,
    description,
    robots: { index: false },
    openGraph: { title: review.paper.title, description, type: "article" },
  };
}

export default async function ReviewPage({ params }: Params) {
  const { id } = await params;
  if (!isValidId(id)) notFound();

  const status = await getStatus(id);
  if (status.state === "missing") notFound();
  if (status.state === "done") {
    const review = await getReview(id);
    if (!review) notFound();
    return <ReviewShell review={review} />;
  }
  return (
    <PendingReview
      id={id}
      initial={status.state === "processing" ? { state: "processing", startedAt: status.startedAt } : { state: "failed", message: status.message }}
    />
  );
}
