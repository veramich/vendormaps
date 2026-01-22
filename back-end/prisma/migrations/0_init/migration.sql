-- CreateExtension
CREATE EXTENSION IF NOT EXISTS postgis;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "vendors";

-- CreateTable
CREATE TABLE "vendors"."vendorlist" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "location" "geometry",

    CONSTRAINT "vendorlist_pkey" PRIMARY KEY ("id")
);

