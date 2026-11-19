import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/auth";

/**
 * Every view, edit, approval and export of patient data leaves a row here.
 * The hospital's data protection officer reads this table; never put the
 * dictation text itself into `details`.
 */
export type AuditAction =
  | "LOGIN"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "RECORDING_UPLOADED"
  | "RECORDING_VIEWED"
  | "RECORDING_REQUEUED"
  | "SEGMENT_EDITED"
  | "FLAG_RESOLVED"
  | "FLAG_DISMISSED"
  | "SUGGESTION_ACCEPTED"
  | "DOCUMENT_APPROVED"
  | "DOCX_EXPORTED"
  | "TERM_ADDED"
  | "TERM_REMOVED"
  | "CORRECTION_TOGGLED"
  | "CORRECTION_REMOVED"
  | "PROTOCOL_REQUESTED"
  | "DOCUMENT_KIND_CHANGED"
  | "PROTOCOL_FIELD_ACCEPTED"
  | "PROTOCOL_FIELD_REJECTED"
  | "PROTOCOL_FIELD_EDITED"
  | "PROTOCOL_APPROVED"
  | "PROTOCOL_DOCX_EXPORTED"
  | "USER_CREATED"
  | "USER_DEACTIVATED"
  | "USER_ACTIVATED"
  | "USER_ROLE_CHANGED"
  | "PASSWORD_RESET"
  | "PASSWORD_CHANGED";

export async function audit(
  action: AuditAction,
  opts: { userId?: string | null; recordingId?: string | null; details?: Prisma.InputJsonValue } = {},
) {
  await prisma.auditLog.create({
    data: {
      action,
      userId: opts.userId ?? null,
      recordingId: opts.recordingId ?? null,
      details: opts.details,
      ip: clientIp(),
    },
  });
}

const VIEW_THROTTLE_MS = 10 * 60 * 1000;

/**
 * Logs that a person opened a recording. The review page re-renders after
 * every edit, so one view row per user and recording per ten minutes.
 */
export async function auditView(userId: string, recordingId: string) {
  const recent = await prisma.auditLog.findFirst({
    where: {
      userId,
      recordingId,
      action: "RECORDING_VIEWED",
      createdAt: { gte: new Date(Date.now() - VIEW_THROTTLE_MS) },
    },
    select: { id: true },
  });
  if (!recent) await audit("RECORDING_VIEWED", { userId, recordingId });
}
