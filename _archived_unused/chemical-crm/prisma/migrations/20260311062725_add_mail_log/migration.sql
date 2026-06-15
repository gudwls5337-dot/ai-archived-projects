-- CreateEnum
CREATE TYPE "MailStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "MailLog" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" "MailStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "MailLog" ADD CONSTRAINT "MailLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
