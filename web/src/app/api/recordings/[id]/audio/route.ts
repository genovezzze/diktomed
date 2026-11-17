import path from "node:path";
import { createReadStream, promises as fs } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sessionForApi } from "@/lib/auth";
import { NORMALIZED_AUDIO, recordingDir } from "@/lib/storage";
import { parseRange } from "@/lib/http-range";

export const dynamic = "force-dynamic";

/** Streams the normalised 16 kHz WAV with range support, so the player can seek. */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await sessionForApi();
  if (!session) return NextResponse.json({ error: "Nepieciešama pieslēgšanās." }, { status: 401 });

  const recording = await prisma.recording.findUnique({
    where: { id: params.id },
    select: { storageKey: true, audioDeletedAt: true },
  });
  if (!recording || recording.audioDeletedAt) {
    return NextResponse.json({ error: "Audio nav pieejams." }, { status: 404 });
  }

  const file = path.join(recordingDir(recording.storageKey), NORMALIZED_AUDIO);
  let size: number;
  try {
    size = (await fs.stat(file)).size;
  } catch {
    return NextResponse.json({ error: "Audio vēl nav sagatavots." }, { status: 404 });
  }

  const baseHeaders: Record<string, string> = {
    "Content-Type": "audio/wav",
    "Accept-Ranges": "bytes",
    // Patient audio: never cached by the browser or anything in between.
    "Cache-Control": "no-store",
  };

  const range = parseRange(request.headers.get("range"), size);
  if (range === "unsatisfiable") {
    return new NextResponse(null, { status: 416, headers: { ...baseHeaders, "Content-Range": `bytes */${size}` } });
  }

  if (!range) {
    const stream = Readable.toWeb(createReadStream(file)) as ReadableStream;
    return new NextResponse(stream, { status: 200, headers: { ...baseHeaders, "Content-Length": String(size) } });
  }

  const stream = Readable.toWeb(createReadStream(file, { start: range.start, end: range.end })) as ReadableStream;
  return new NextResponse(stream, {
    status: 206,
    headers: {
      ...baseHeaders,
      "Content-Length": String(range.end - range.start + 1),
      "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
    },
  });
}
