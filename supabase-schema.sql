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

create table if not exists public.department_units (
  id uuid primary key default gen_random_uuid(),
  unit_code text not null unique,
  unit_name text not null,
  block_name text,
  unit_type text default 'Khoa',
  is_active boolean default true,
  display_order integer default 0,
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
  progress_date date,
  category text,
  clinical_progress text,
  paraclinical text,
  intervention text,
  note text,
  created_at timestamptz default now()
);

alter table public.duty_report_patients
  drop constraint if exists duty_report_patients_report_id_idbn_key;

alter table public.duty_report_patients
  add column if not exists progress_date date,
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
alter table public.department_units enable row level security;
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
