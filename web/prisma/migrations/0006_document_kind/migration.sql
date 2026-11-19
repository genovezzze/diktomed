-- A recording is drafted into an operation protocol or an epicrisis; each
-- kind has its own sections. Additive: existing rows become OPERATION.
CREATE TYPE "document_kind" AS ENUM ('OPERATION', 'EPICRISIS');
ALTER TABLE "recordings" ADD COLUMN "document_kind" "document_kind" NOT NULL DEFAULT 'OPERATION';
ALTER TABLE "protocol_sections" ADD COLUMN "document_kind" "document_kind" NOT NULL DEFAULT 'OPERATION';
