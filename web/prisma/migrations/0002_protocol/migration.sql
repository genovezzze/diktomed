-- CreateEnum
CREATE TYPE "protocol_status" AS ENUM ('QUEUED', 'PROCESSING', 'READY', 'APPROVED', 'FAILED');

-- CreateEnum
CREATE TYPE "field_check" AS ENUM ('OK', 'EMPTY', 'NO_QUOTE', 'QUOTE_NOT_FOUND', 'NUMBER_MISMATCH', 'SIDE_MISMATCH');

-- CreateEnum
CREATE TYPE "field_status" AS ENUM ('SUGGESTED', 'ACCEPTED', 'EDITED', 'REJECTED');

-- CreateTable
CREATE TABLE "protocol_sections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "hint" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "multi" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "protocol_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "protocols" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recording_id" UUID NOT NULL,
    "status" "protocol_status" NOT NULL DEFAULT 'QUEUED',
    "engine" TEXT,
    "error_message" TEXT,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "protocols_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "protocol_fields" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "protocol_id" UUID NOT NULL,
    "section_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "value" TEXT,
    "quotes" JSONB NOT NULL DEFAULT '[]',
    "check" "field_check" NOT NULL DEFAULT 'OK',
    "check_message" TEXT,
    "status" "field_status" NOT NULL DEFAULT 'SUGGESTED',
    "edited_by_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "protocol_fields_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "protocol_sections_key_key" ON "protocol_sections"("key");

-- CreateIndex
CREATE UNIQUE INDEX "protocols_recording_id_key" ON "protocols"("recording_id");

-- CreateIndex
CREATE UNIQUE INDEX "protocol_fields_protocol_id_section_key_key" ON "protocol_fields"("protocol_id", "section_key");

-- AddForeignKey
ALTER TABLE "protocols" ADD CONSTRAINT "protocols_recording_id_fkey" FOREIGN KEY ("recording_id") REFERENCES "recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocols" ADD CONSTRAINT "protocols_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocol_fields" ADD CONSTRAINT "protocol_fields_protocol_id_fkey" FOREIGN KEY ("protocol_id") REFERENCES "protocols"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocol_fields" ADD CONSTRAINT "protocol_fields_edited_by_id_fkey" FOREIGN KEY ("edited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

