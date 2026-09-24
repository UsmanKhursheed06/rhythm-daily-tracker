revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
create policy service_deliveries on public.rhythm_deliveries for all to service_role using(true) with check(true);
