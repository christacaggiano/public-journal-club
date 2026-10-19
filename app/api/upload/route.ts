import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { config, useBlob } from "@/lib/config";

/**
 * Issues short-lived tokens so the browser can upload PDFs straight to Vercel Blob.
 * This avoids the 4.5 MB request-body limit on Vercel functions.
 */
export async function POST(request: Request) {
  if (!useBlob) {
    return NextResponse.json({ error: "Direct uploads aren't configured on this server." }, { status: 400 });
  }
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith("uploads/") || !pathname.toLowerCase().endsWith(".pdf")) {
          throw new Error("Only PDF uploads are allowed.");
        }
        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: config.maxPdfBytes,
          addRandomSuffix: true,
          validUntil: Date.now() + 10 * 60 * 1000,
        };
      },
      onUploadCompleted: async () => {
        // The review request that follows the upload does all the work.
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
