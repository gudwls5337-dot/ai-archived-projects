-- CreateEnum
CREATE TYPE "Segment" AS ENUM ('exhibition_booth', 'tendata_volume', 'distributor_by_country', 'met_in_person', 'inbound');

-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('NEW', 'CONTACTED', 'PROPOSED', 'CONTRACTED');

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "segment" "Segment" NOT NULL,
    "pipelineStage" "PipelineStage" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);
