create extension if not exists pgcrypto;

create table if not exists public.duty_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  block_name text not null,
  department_name text not null,
  reporter_name text,
  doctor_name text,
  nurse_name text,
  department_commander text,
  patient_census integer default 0,
  admissions integer default 0,
  transfers_in integer default 0,
  transfers_out integer default 0,
  deaths integer default 0,
  severe_discharge integer default 0,
  hospital_transfers integer default 0,
  discharges integer default 0,
  transfers integer default 0,
  emergency_surgery integer default 0,
  emergency_procedure integer default 0,
  special_surgery integer default 0,
  surgery_level1 integer default 0,
  surgery_level2 integer default 0,
  surgery_level3 integer default 0,
  ct_mri integer default 0,
  incidents text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.patients (
  idbn text primary key,
  full_name text not null,
  birth_year integer,
  admission_date date,
  department_date date,
  transfer_to text,
  transfer_out_date date,
  outcome text,
  outcome_date date,
  diagnosis text,
  history text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  unit text,
  username text not null unique,
  password text not null,
  role text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.department_units (
  id uuid not null default gen_random_uuid(),
  unit_code text not null,
  unit_name text not null,
  block_name text,
  unit_type text default 'Khoa',
  is_active boolean default true,
  display_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint department_units_pkey primary key (id),
  constraint department_units_unit_code_key unique (unit_code)
);

create table if not exists public.duty_report_patients (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.duty_reports(id) on delete cascade,
  idbn text not null references public.patients(idbn),
  full_name text not null,
  birth_year integer,
  admission_date date,
  department_date date,
  transfer_to text,
  diagnosis text,
  history text,
  progress_date date,
  category text,
  clinical_progress text,
  paraclinical text,
  intervention text,
  image_url text,
  image_urls jsonb default '[]'::jsonb,
  note text,
  created_at timestamptz default now()
);

create table if not exists public.patient_progress (
  id uuid primary key default gen_random_uuid(),
  idbn text not null references public.patients(idbn) on delete cascade,
  progress_date date not null,
  category text default 'Theo dõi',
  clinical_progress text,
  paraclinical text,
  intervention text,
  image_url text,
  image_urls jsonb default '[]'::jsonb,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.duty_report_patients
  drop constraint if exists duty_report_patients_report_id_idbn_key;

alter table public.duty_report_patients
  add column if not exists progress_date date,
  add column if not exists clinical_progress text,
  add column if not exists paraclinical text,
  add column if not exists intervention text,
  add column if not exists image_url text,
  add column if not exists image_urls jsonb default '[]'::jsonb,
  add column if not exists note text;

alter table public.patient_progress
  add column if not exists image_url text,
  add column if not exists image_urls jsonb default '[]'::jsonb;

alter table public.duty_reports
  add column if not exists reporter_name text,
  add column if not exists admissions integer default 0,
  add column if not exists transfers_in integer default 0,
  add column if not exists transfers_out integer default 0,
  add column if not exists hospital_transfers integer default 0,
  add column if not exists discharges integer default 0,
  add column if not exists special_surgery integer default 0,
  add column if not exists surgery_level1 integer default 0,
  add column if not exists surgery_level2 integer default 0,
  add column if not exists surgery_level3 integer default 0;

alter table public.patients
  add column if not exists transfer_out_date date,
  add column if not exists outcome text,
  add column if not exists outcome_date date;

alter table public.duty_reports enable row level security;
alter table public.patients enable row level security;
alter table public.app_users enable row level security;
alter table public.department_units enable row level security;
alter table public.duty_report_patients enable row level security;
alter table public.patient_progress enable row level security;

drop policy if exists "full access" on public.duty_reports;
create policy "full access"
on public.duty_reports
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "full access" on public.patients;
create policy "full access"
on public.patients
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "full access" on public.app_users;
create policy "full access"
on public.app_users
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "full access" on public.department_units;
create policy "full access"
on public.department_units
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "full access" on public.duty_report_patients;
create policy "full access"
on public.duty_report_patients
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "full access" on public.patient_progress;
create policy "full access"
on public.patient_progress
for all
to anon, authenticated
using (true)
with check (true);

insert into public.department_units (unit_code, unit_name, block_name, unit_type, display_order)
values
  ('A01', 'A01 Nội tim mạch', 'Khối Nội', 'Khoa', 10),
  ('A02', 'A02 Hồi sức cấp cứu', 'Khối Nội', 'Khoa', 20),
  ('B01', 'B01 Ngoại tổng hợp', 'Khối Ngoại', 'Khoa', 30),
  ('B03', 'B03 Chấn thương chỉnh hình', 'Khối Ngoại', 'Khoa', 40),
  ('C01', 'C01 Truyền nhiễm', 'Khối Nội', 'Khoa', 50),
  ('KHTH', 'Phòng Kế hoạch tổng hợp', 'Khối Hành chính', 'Phòng', 900)
on conflict (unit_code) do update
set
  unit_name = excluded.unit_name,
  block_name = excluded.block_name,
  unit_type = excluded.unit_type,
  display_order = excluded.display_order,
  updated_at = now();

-- Ensure required columns exist (safe idempotent migration)
alter table if exists public.duty_report_patients
  add column if not exists report_id uuid,
  add column if not exists category text,
  add column if not exists progress_date date,
  add column if not exists clinical_progress text,
  add column if not exists paraclinical text,
  add column if not exists intervention text,
  add column if not exists note text,
  add column if not exists created_at timestamptz default now();

alter table if exists public.duty_reports
  add column if not exists reporter_name text,
  add column if not exists admissions integer default 0,
  add column if not exists transfers_in integer default 0,
  add column if not exists transfers_out integer default 0,
  add column if not exists hospital_transfers integer default 0,
  add column if not exists discharges integer default 0;

alter table if exists public.patients
  add column if not exists transfer_out_date date,
  add column if not exists outcome text,
  add column if not exists outcome_date date;

alter table if exists public.department_units
  add column if not exists unit_code text,
  add column if not exists unit_name text,
  add column if not exists block_name text,
  add column if not exists unit_type text default 'Khoa',
  add column if not exists is_active boolean default true,
  add column if not exists display_order integer default 0;

-- If report_id should be NOT NULL, enforce it after existing reports are migrated.
-- alter table public.duty_report_patients
--   alter column report_id set not null;
