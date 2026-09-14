-- FAQ table
create table public.faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null check (length(trim(question)) > 0),
  answer_html text not null check (length(trim(answer_html)) > 0),
  categories text[] not null,
  images jsonb not null default '[]'::jsonb check (jsonb_typeof(images) = 'array'),
  display_order integer not null default 1000 check (display_order >= 0),
  is_published boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint faqs_categories_required check (cardinality(categories) >= 1),
  constraint faqs_categories_allowed check (
    categories <@ array['수강신청','수료학점','졸업','논문','생활','기타']::text[]
  )
);

create index faqs_public_order_idx
  on public.faqs (is_published, display_order, created_at desc);

create or replace function public.set_faq_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_faq_updated_at before update on public.faqs
for each row execute function public.set_faq_updated_at();

alter table public.faqs enable row level security;
revoke all on table public.faqs from anon, authenticated;
grant select on table public.faqs to anon;
grant select, insert, update, delete on table public.faqs to authenticated;

create policy "Public can read published FAQs" on public.faqs
for select to anon using (is_published = true);
create policy "Authenticated user can read all FAQs" on public.faqs
for select to authenticated using (true);
create policy "Authenticated user can create FAQs" on public.faqs
for insert to authenticated with check ((select auth.uid()) is not null);
create policy "Authenticated user can update FAQs" on public.faqs
for update to authenticated using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);
create policy "Authenticated user can delete FAQs" on public.faqs
for delete to authenticated using ((select auth.uid()) is not null);

-- Storage bucket policies. Create a public bucket named faq-images first.
create policy "Admin can read FAQ images" on storage.objects
for select to authenticated using (bucket_id = 'faq-images');
create policy "Admin can upload FAQ images" on storage.objects
for insert to authenticated with check (bucket_id = 'faq-images');
create policy "Admin can update FAQ images" on storage.objects
for update to authenticated using (bucket_id = 'faq-images')
with check (bucket_id = 'faq-images');
create policy "Admin can delete FAQ images" on storage.objects
for delete to authenticated using (bucket_id = 'faq-images');
