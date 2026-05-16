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
  category text,
  clinical_progress text,
  paraclinical text,
  intervention text,
  note text,
  created_at timestamptz default now(),
  unique (report_id, idbn)
);

alter table public.duty_report_patients
  add column if not exists clinical_progress text,
  add column if not exists paraclinical text,
  add column if not exists intervention text,
  add column if not exists note text;

alter table public.duty_reports
  add column if not exists reporter_name text,
  add column if not exists admissions integer default 0,
  add column if not exists transfers_in integer default 0,
  add column if not exists transfers_out integer default 0,
  add column if not exists hospital_transfers integer default 0,
  add column if not exists discharges integer default 0;

alter table public.patients
  add column if not exists transfer_out_date date,
  add column if not exists outcome text,
  add column if not exists outcome_date date;

alter table public.duty_reports enable row level security;
alter table public.patients enable row level security;
alter table public.app_users enable row level security;
alter table public.duty_report_patients enable row level security;

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

drop policy if exists "full access" on public.duty_report_patients;
create policy "full access"
on public.duty_report_patients
for all
to anon, authenticated
using (true)
with check (true);
