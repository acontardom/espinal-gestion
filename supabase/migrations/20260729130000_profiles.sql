-- profiles — perfil de aplicación por usuario de auth.
-- Registro CERRADO: los usuarios los crea el admin desde el dashboard de Supabase.
-- Sin trigger de auto-creación: la fila de profiles se crea a mano junto al usuario.

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nombre      text,
  rol         text not null default 'admin' check (rol in ('superadmin', 'admin')),
  created_at  timestamptz not null default now()
);

comment on table public.profiles is 'Perfil de aplicación. Se crea manualmente junto al usuario en el dashboard de Supabase (registro cerrado).';
comment on column public.profiles.rol is 'superadmin | admin (§10). El rol operador aún no está habilitado en v1.';

-- ---------------------------------------------------------------------------
-- RLS — solo lectura desde la app. Alta, edición y borrado van por el dashboard
-- (service role), que ignora RLS.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy "profiles_select_all" on public.profiles
  for select to authenticated using (true);
