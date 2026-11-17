import type { FlagKind, FlagSeverity, RecordingStatus, Side } from "@prisma/client";

export const SIDE_LABELS: Record<Side, string> = {
  LEFT: "Kreisā",
  RIGHT: "Labā",
  BOTH: "Abas puses",
};

export const STATUS_LABELS: Record<RecordingStatus, string> = {
  QUEUED: "Rindā",
  PROCESSING: "Apstrādā",
  READY: "Gaida pārbaudi",
  APPROVED: "Apstiprināts",
  FAILED: "Kļūda",
};

export const STATUS_BADGE: Record<RecordingStatus, "default" | "success" | "warning" | "destructive" | "muted"> = {
  QUEUED: "muted",
  PROCESSING: "default",
  READY: "warning",
  APPROVED: "success",
  FAILED: "destructive",
};

export const FLAG_KIND_LABELS: Record<FlagKind, string> = {
  SIDE_MISMATCH: "Operācijas puse",
  POSSIBLE_HALLUCINATION: "Iespējama halucinācija",
  LOW_CONFIDENCE_LINE: "Zema rindas ticamība",
  LOW_CONFIDENCE_WORD: "Neskaidrs vārds",
  NUMBER: "Skaitlis",
  TERM: "Bieži labots vārds",
  AI_SUGGESTION: "MI ieteikums",
};

export const SEVERITY_LABELS: Record<FlagSeverity, string> = {
  HIGH: "Augsts risks",
  MEDIUM: "Vidējs risks",
  INFO: "Informācija",
};

export const AUDIT_LABELS: Record<string, string> = {
  LOGIN: "Pieslēdzās",
  LOGIN_FAILED: "Neveiksmīga pieslēgšanās",
  LOGOUT: "Izgāja",
  RECORDING_UPLOADED: "Augšupielādēja diktātu",
  RECORDING_VIEWED: "Atvēra diktātu",
  RECORDING_REQUEUED: "Atkārtoja apstrādi",
  RECORDING_PROCESSED: "Diktāts apstrādāts",
  RECORDING_FAILED: "Apstrāde neizdevās",
  SEGMENT_EDITED: "Laboja tekstu",
  FLAG_RESOLVED: "Atzīmēja kā pārbaudītu",
  FLAG_DISMISSED: "Noraidīja atzīmi",
  SUGGESTION_ACCEPTED: "Pieņēma ieteikumu",
  DOCUMENT_APPROVED: "Apstiprināja dokumentu",
  DOCX_EXPORTED: "Lejupielādēja DOCX",
  AUDIO_DELETED: "Audio dzēsts (glabāšanas termiņš)",
  TERM_ADDED: "Pievienoja terminu",
  TERM_REMOVED: "Dzēsa terminu",
  CORRECTION_TOGGLED: "Mainīja labojuma ieteikšanu",
  CORRECTION_REMOVED: "Dzēsa iemācīto labojumu",
  PROTOCOL_REQUESTED: "Pieprasīja protokolu no jauna",
  PROTOCOL_DRAFTED: "Protokola melnraksts sagatavots",
  PROTOCOL_FIELD_ACCEPTED: "Pieņēma protokola lauku",
  PROTOCOL_FIELD_REJECTED: "Noraidīja protokola lauku",
  PROTOCOL_FIELD_EDITED: "Laboja protokola lauku",
  PROTOCOL_APPROVED: "Apstiprināja protokolu",
  PROTOCOL_DOCX_EXPORTED: "Lejupielādēja protokolu DOCX",
  USER_CREATED: "Izveidoja lietotāju",
  USER_DEACTIVATED: "Atslēdza lietotāju",
  USER_ACTIVATED: "Ieslēdza lietotāju",
  USER_ROLE_CHANGED: "Mainīja lietotāja lomu",
  PASSWORD_RESET: "Izsniedza pagaidu paroli",
  PASSWORD_CHANGED: "Nomainīja paroli",
};
