// Real PostgreSQL semantics in an isolated in-memory database; never uses live data.
const { PGlite } = require(process.argv[2]);
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const unconfirmed = '33333333-3333-4333-8333-333333333333';
(async () => {
    const db = new PGlite();
    try {
        await db.exec(`
            create role anon; create role authenticated;
            create schema auth; create schema storage;
            create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
            create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
            grant usage on schema auth to authenticated;
            create table public.categories(id bigint primary key); insert into categories values(1);
            create table storage.objects(bucket_id text,name text);
            create table public.items(id bigint generated always as identity primary key,user_id uuid references auth.users not null,
                category_id bigint references categories,title text,description text,item_type text,location text,event_date date,status text,image_url text);
            alter table items enable row level security;
            grant select on items to anon,authenticated;
            create policy read_items on items for select using(status in ('approved','claimed') or user_id=auth.uid());
        `);
        for (const [id, confirmed] of [[owner, true], [other, true], [unconfirmed, false]]) await db.query('insert into auth.users values($1,$2,$3)',[id,id+'@pcu.edu.ph',confirmed?'2026-01-01':null]);
        await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/report-contacts.sql'),'utf8'));
        const migration = fs.readFileSync(path.join(__dirname,'../supabase/report-management.sql'),'utf8');
        await db.exec(migration); await db.exec(migration);
        const identity = async (id, role='authenticated') => {
            await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); await db.exec('set role '+role);
        };
        const seeded = await db.query("insert into items(user_id,category_id,title,description,item_type,location,event_date,status) values($1,1,'Blue notebook','A notebook with a blue cover','lost','Library','2026-01-01','approved') returning id",[owner]);
        const id = seeded.rows[0].id;
        await db.query("insert into report_contacts(item_id,method,value,consent) values($1,'email','original@pcu.edu.ph',true)",[id]);
        const call = async (action, version=null, report=null, contact=null) => (await db.query('select manage_own_report($1,$2,$3,$4::jsonb,$5::jsonb) as result',[id,action,version,report?JSON.stringify(report):null,contact?JSON.stringify(contact):null])).rows[0].result;
        await identity(owner);
        let snapshot = await call('get');
        assert.equal(snapshot.report.user_id,owner); assert.equal(snapshot.contact.value,'original@pcu.edu.ph');
        const patch = { ...snapshot.report, title:'Blue notebook edited', status:'approved', user_id:other };
        for (const [who,role] of [[other,'authenticated'],[unconfirmed,'authenticated'],['','anon']]) {
            await identity(who,role);
            await assert.rejects(call('get'));
            await assert.rejects(call('edit',snapshot.version,patch));
            await assert.rejects(call('return',snapshot.version));
        }
        console.log('PASS owner-only access, confirmed account requirement, anonymous RPC denial');
        await identity(owner);
        await assert.rejects(call('edit',snapshot.version,patch,{method:'email',value:'bad@example.com',consent:true}));
        assert.equal((await call('get')).report.status,'approved');
        assert.equal((await call('get')).contact.value,'original@pcu.edu.ph');
        await assert.rejects(call('edit',snapshot.version,patch,{method:'email',value:'valid@pcu.edu.ph',consent:false}));
        await assert.rejects(call('edit',snapshot.version,{...patch,event_date:'2999-01-01'}));
        await assert.rejects(call('edit',snapshot.version,{...patch,title:' '}));
        await assert.rejects(call('edit',snapshot.version,{...patch,category_id:999}));
        for (const image_url of ['https://example.com/photo.jpg',other+'/abc.jpg',owner+'/missing.jpg']) await assert.rejects(call('edit',snapshot.version,{...patch,image_url}));
        console.log('PASS contact validation, consent, field and photo ownership checks, atomic rollback');
        const photo = owner+'/abcdef12-3456.jpg';
        await db.exec('reset role'); await db.query("insert into storage.objects values('report-photos',$1)",[photo]); await identity(owner);
        const updated = await call('edit',snapshot.version,{...patch,image_url:photo},{method:'phone',value:'09123456789',consent:true});
        assert.equal(updated.status,'pending');
        snapshot = await call('get');
        assert.equal(snapshot.report.user_id,owner); assert.equal(snapshot.report.image_url,photo); assert.equal(snapshot.contact.method,'phone');
        await identity('', 'anon'); assert.equal((await db.query('select * from items')).rows.length,0);
        await identity(other); assert.equal((await db.query('select * from report_contacts')).rows.length,0);
        console.log('PASS edited public reports become pending; ownership is immutable; contact becomes private');
        await identity(owner);
        await assert.rejects(call('return',snapshot.version));
        const pendingVersion = snapshot.version;
        await db.exec('reset role'); await db.query("update items set status='approved' where id=$1",[id]); await identity(owner);
        await assert.rejects(call('edit',pendingVersion,patch),/changed/);
        snapshot = await call('get');
        await call('edit',snapshot.version,{...patch,image_url:null},null);
        let removed = await call('get');
        assert.equal(removed.contact,null); assert.equal(removed.report.image_url,null);
        await assert.rejects(call('edit',snapshot.version,patch),/changed/);
        console.log('PASS stale snapshots rejected; photos and contact can be removed atomically');
        await db.exec('reset role'); await db.query("update items set status='approved' where id=$1",[id]); await identity(owner);
        snapshot = await call('get');
        const closed = await call('return',snapshot.version);
        assert.equal(closed.status,'claimed');
        const after = await call('get');
        assert.equal(after.report.title,snapshot.report.title);
        await assert.rejects(call('edit',after.version,patch),/Returned/);
        await assert.rejects(call('return',after.version),/approved/);
        await identity('','anon'); assert.equal((await db.query('select * from items')).rows[0].status,'claimed');
        console.log('PASS only approved reports close, history remains public, closed reports cannot be edited or closed twice');
    } finally { await db.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
