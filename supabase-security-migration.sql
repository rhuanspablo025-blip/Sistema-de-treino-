-- Execute once in the Supabase SQL Editor for databases created before the hardened schemas.
drop policy if exists "staff can manage profiles" on public.profiles;
drop policy if exists "staff manage workouts" on public.workout_plans;
drop policy if exists "students update own measurements" on public.body_measurements;
drop policy if exists "staff manage measurements" on public.body_measurements;

create policy "staff can manage profiles" on public.profiles for all
using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('dev', 'admin'))
with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('dev', 'admin'));

create policy "staff manage workouts" on public.workout_plans for all
using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('dev', 'admin'))
with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('dev', 'admin'));

create policy "students update own measurements" on public.body_measurements for update
using (student_id = auth.uid()) with check (student_id = auth.uid());

create policy "staff manage measurements" on public.body_measurements for all
using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('dev', 'admin'))
with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('dev', 'admin'));