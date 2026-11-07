// Isolated PostgreSQL check; never connects to the live project.
// Run: node tests/contact-database.cjs <path-to-pglite-package>
const { PGlite } = require(process.argv[2]);
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'];
(async () => {
    const db = new PGlite();
    try {
        await db.exec(`
            create role anon; create role authenticated;
            create schema auth;
            create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
            create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
            grant usage on schema auth to authenticated;
            grant execute on function auth.uid() to authenticated;
            create table public.items (id bigint generated always as identity primary key, user_id uuid not null references auth.users,
                category_id bigint, title text not null, description text not null, item_type text not null,
                location text not null, event_date date not null, status text not null default 'pending', image_url text);
            alter table public.items enable row level security;
            grant select on public.items to anon, authenticated;
            grant insert on public.items to authenticated;
            grant usage on sequence public.items_id_seq to authenticated;
            create policy read_items on public.items for select using (status in ('approved','claimed') or user_id = auth.uid());
            create policy insert_items on public.items for insert to authenticated with check (user_id = auth.uid() and status = 'pending');
        `);
        for (let i = 0; i < ids.length; i++) await db.query('insert into auth.users values ($1,$2,$3)', [ids[i], i === 2 ? 'outsider@example.com' : `member${i}@pcu.edu.ph`, i === 3 ? null : '2026-11-01']);
        const sql = fs.readFileSync(path.join(__dirname, '../supabase/report-contacts.sql'), 'utf8');
        await db.exec(sql);
        await db.exec(sql); // Rerunning setup must preserve data and permissions.
        const identity = async (id, role = 'authenticated') => {
            await db.exec('reset role');
            await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
            await db.exec('set role ' + role);
        };
        const report = { title: 'Test bag', description: 'Blue bag for an isolated test', item_type: 'found', location: 'Library', event_date: '2026-11-01', category_id: 1, user_id: ids[1], status: 'approved' };
        const submit = (value, consent = true) => db.query('select public.submit_report_with_contact($1::jsonb,$2,$3,$4) as id', [JSON.stringify(report), 'email', value, consent]);
        await identity(ids[0]);
        const result = await submit('reporter@pcu.edu.ph');
        const itemId = result.rows[0].id;
        const saved = (await db.query('select * from items')).rows[0];
        assert.equal(saved.user_id, ids[0]); assert.equal(saved.status, 'pending');
        assert.equal((await db.query('select * from report_contacts')).rows.length, 1);
        await assert.rejects(submit('reporter@pcu.edu.ph', false));
        await assert.rejects(submit('bad@example.com'));
        assert.equal((await db.query('select * from items')).rows.length, 1, 'Failed contact writes must roll back the report');
        console.log('PASS atomic submission, explicit consent, validation, and forced owner/pending status');
        await identity(ids[1]);
        assert.equal((await db.query('select * from report_contacts')).rows.length, 0);
        await assert.rejects(db.query('insert into report_contacts values ($1,$2,$3,true,now())', [itemId, 'phone', '09123456789']));
        console.log('PASS pending contacts and other reporters cannot be accessed or modified');
        await db.exec('reset role'); await db.query("update items set status='approved' where id=$1", [itemId]);
        await identity(ids[1]); assert.equal((await db.query('select * from report_contacts')).rows.length, 1);
        for (const id of [ids[2], ids[3]]) {
            await identity(id); assert.equal((await db.query('select * from report_contacts')).rows.length, 0);
            await assert.rejects(submit('reporter@pcu.edu.ph'));
        }
        await identity('', 'anon'); await assert.rejects(db.query('select * from report_contacts'));
        await assert.rejects(submit('reporter@pcu.edu.ph'));
        console.log('PASS public contacts restricted to confirmed PCU accounts; anonymous access denied');
        await db.exec('reset role'); await db.query("update items set status='claimed' where id=$1", [itemId]);
        await identity(ids[1]); assert.equal((await db.query('select * from report_contacts')).rows.length, 0);
        await identity(ids[0]); assert.equal((await db.query('select * from report_contacts')).rows.length, 1);
        await db.query('delete from report_contacts where item_id=$1', [itemId]);
        assert.equal((await db.query('select * from report_contacts')).rows.length, 0);
        console.log('PASS closed report privacy and owner contact removal');
        // Match the project's existing owner-delete policy and cascading claims FK.
        await db.exec(`reset role;
            grant delete on public.items to authenticated;
            create policy delete_own_items on public.items for delete to authenticated using (user_id = auth.uid());
            create table public.claims (id bigint generated always as identity primary key, item_id bigint references items(id) on delete cascade);
        `);
        await identity(ids[0]);
        const deletionId = (await submit('reporter@pcu.edu.ph')).rows[0].id;
        await db.exec('reset role');
        await db.query('insert into claims(item_id) values ($1)', [deletionId]);
        await db.query("update items set status='approved' where id=$1", [deletionId]);
        await identity(ids[1]);
        assert.equal((await db.query('delete from items where id=$1 returning id', [deletionId])).rows.length, 0);
        await identity(ids[0]);
        assert.equal((await db.query('delete from items where id=$1 and user_id=auth.uid() returning id', [deletionId])).rows.length, 1);
        await db.exec('reset role');
        assert.equal((await db.query('select * from report_contacts where item_id=$1', [deletionId])).rows.length, 0);
        assert.equal((await db.query('select * from claims where item_id=$1', [deletionId])).rows.length, 0);
        console.log('PASS owner-only report deletion and cascading removal of contacts and claims');
    } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
