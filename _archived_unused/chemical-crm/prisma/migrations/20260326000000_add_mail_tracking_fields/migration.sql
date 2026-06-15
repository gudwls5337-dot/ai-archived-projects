-- MailLog: add open tracking + relation columns
ALTER TABLE "MailLog" ADD COLUMN IF NOT EXISTS "sentAt"         TIMESTAMP(3);
ALTER TABLE "MailLog" ADD COLUMN IF NOT EXISTS "companyId"      TEXT;
ALTER TABLE "MailLog" ADD COLUMN IF NOT EXISTS "sequenceId"     TEXT;
ALTER TABLE "MailLog" ADD COLUMN IF NOT EXISTS "sequenceStepId" TEXT;
ALTER TABLE "MailLog" ADD COLUMN IF NOT EXISTS "lastOpenedAt"   TIMESTAMP(3);
ALTER TABLE "MailLog" ADD COLUMN IF NOT EXISTS "openCount"      INTEGER NOT NULL DEFAULT 0;

-- Foreign keys (SET NULL on delete so logs survive if company/sequence is deleted)
ALTER TABLE "MailLog"
  ADD CONSTRAINT "MailLog_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MailLog"
  ADD CONSTRAINT "MailLog_sequenceId_fkey"
  FOREIGN KEY ("sequenceId") REFERENCES "Sequence"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MailLog"
  ADD CONSTRAINT "MailLog_sequenceStepId_fkey"
  FOREIGN KEY ("sequenceStepId") REFERENCES "SequenceStep"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
