-- Migration: add missing columns to match application expectations
-- Run this in Supabase SQL Editor. Safe to run multiple times thanks to IF NOT EXISTS.

ALTER TABLE IF EXISTS public.duty_report_patients
  ADD COLUMN IF NOT EXISTS report_id uuid,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS progress_date date,
  ADD COLUMN IF NOT EXISTS clinical_progress text,
  ADD COLUMN IF NOT EXISTS paraclinical text,
  ADD COLUMN IF NOT EXISTS intervention text,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.duty_reports
  ADD COLUMN IF NOT EXISTS reporter_name text,
  ADD COLUMN IF NOT EXISTS admissions integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transfers_in integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transfers_out integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hospital_transfers integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discharges integer DEFAULT 0;

ALTER TABLE IF EXISTS public.patients
  ADD COLUMN IF NOT EXISTS transfer_out_date date,
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS outcome_date date;

ALTER TABLE IF EXISTS public.department_units
  ADD COLUMN IF NOT EXISTS unit_code text,
  ADD COLUMN IF NOT EXISTS unit_name text,
  ADD COLUMN IF NOT EXISTS block_name text,
  ADD COLUMN IF NOT EXISTS unit_type text DEFAULT 'Khoa',
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0;

-- Optional: after verifying data, you can add FK and NOT NULL constraints
-- ALTER TABLE public.duty_report_patients
--   ADD CONSTRAINT duty_report_patients_report_id_fkey
--   FOREIGN KEY (report_id) REFERENCES public.duty_reports(id) ON DELETE CASCADE;
--
-- ALTER TABLE public.duty_report_patients
--   ALTER COLUMN report_id SET NOT NULL;
