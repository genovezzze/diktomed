-- Speech in the audio with no text under it (the recogniser skipped it).
ALTER TYPE "flag_kind" ADD VALUE IF NOT EXISTS 'MISSING_SPEECH';
