-- Migration: add surgery level count fields for department duty report item 3.
-- Run this in Supabase SQL Editor. Safe to run multiple times.

ALTER TABLE IF EXISTS public.duty_reports
  ADD COLUMN IF NOT EXISTS special_surgery integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS surgery_level1 integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS surgery_level2 integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS surgery_level3 integer DEFAULT 0;
