import { ImageResponse } from "next/og";
import { getReview, getStatus, isValidId } from "@/lib/storage";

export const runtime = "nodejs";
export const alt = "Public Journal Club review";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const TONE = { bad: "#b23a30", mid: "#a8701a", good: "#2b7553" };

/** Social preview: paper title plus the four trust ratings. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const review = isValidId(id) && (await getStatus(id)).state === "done" ? await getReview(id) : null;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#e9ecf0", padding: 64, color: "#18212c" }}>
        <div style={{ display: "flex", fontSize: 30, fontWeight: 600 }}>
          Public&nbsp;<span style={{ color: "#2c4a7a" }}>Journal Club</span>
        </div>
        <div style={{ display: "flex", marginTop: 40, fontSize: review && review.paper.title.length > 90 ? 44 : 54, fontWeight: 600, lineHeight: 1.15 }}>
          {review ? review.paper.title : "Plain-language reviews of scientific papers"}
        </div>
        {review ? (
          <div style={{ display: "flex", marginTop: 16, fontSize: 26, color: "#586373" }}>
            {[review.paper.journal, review.paper.year].filter(Boolean).join(" · ")}
          </div>
        ) : null}
        <div style={{ display: "flex", marginTop: "auto", gap: 20 }}>
          {(review?.barometers ?? []).slice(0, 4).map((m) => {
            const max = m.max || 5;
            const frac = (m.higher_is === "worse" ? max - m.score : m.score) / max;
            const color = frac < 0.35 ? TONE.bad : frac < 0.65 ? TONE.mid : TONE.good;
            return (
              <div
                key={m.id}
                style={{ display: "flex", flexDirection: "column", flex: 1, background: "#fbfcfd", border: "2px solid #d2d8e0", borderRadius: 14, padding: "18px 22px" }}
              >
                <div style={{ display: "flex", fontSize: 20, color: "#586373", textTransform: "uppercase", letterSpacing: 1 }}>{m.label}</div>
                <div style={{ display: "flex", fontSize: 34, fontWeight: 600, color, marginTop: 6 }}>{m.rating}</div>
              </div>
            );
          })}
        </div>
      </div>
    ),
    size,
  );
}
