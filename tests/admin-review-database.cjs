// Isolated PostgreSQL tests. Never reads or writes production records.
const { PGlite } = require(process.argv[2]);
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const admin='11111111-1111-4111-8111-111111111111', owner='22222222-2222-4222-8222-222222222222', stranger='33333333-3333-4333-8333-333333333333';
(async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated,anon;
   create table profiles(id uuid primary key,full_name text,role text);
   create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and role='admin')$$;
   create table categories(id bigint primary key,name text);insert into categories values(1,'Books');
   create table storage.objects(bucket_id text,name text);
   create table items(id bigint generated always as identity primary key,user_id uuid references auth.users,category_id bigint references categories,title text,description text,item_type text,location text,event_date date,status text,image_url text,created_at timestamptz default now());
   alter table items enable row level security;
   grant select,update,delete on items to authenticated;
   create policy read_items on items for select using(user_id=auth.uid() or is_admin());
   create policy update_items on items for update using(user_id=auth.uid() or is_admin()) with check(user_id=auth.uid() or is_admin());
  `);
  for(const [id,name,role] of [[admin,'Admin One','admin'],[owner,'Reporter','user'],[stranger,'Other','user']]) {
   await db.query('insert into auth.users values($1,$2,now())',[id,id+'@pcu.edu.ph']);await db.query('insert into profiles values($1,$2,$3)',[id,name,role]);
  }
  for(const file of ['report-contacts.sql','report-management.sql','admin-review.sql','admin-review.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../supabase',file),'utf8'));
  const id=(await db.query("insert into items(user_id,category_id,title,description,item_type,location,event_date,status) values($1,1,'Blue notebook','A blue notebook with a red cover','lost','Library','2026-01-01','pending') returning id",[owner])).rows[0].id;
  const identity=async(who,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[who]);await db.exec('set role '+role);};
  const list=async(view='pending',page=0)=>(await db.query('select admin_review_list($1,$2) r',[view,page])).rows[0].r;
  const review=async(version,status,reason=null)=>(await db.query('select review_report($1,$2,$3,$4) r',[id,version,status,reason])).rows[0].r;
  const feedback=async()=>(await db.query('select own_report_feedback($1::bigint[]) r',[[id]])).rows[0].r;
  await identity(admin);assert.equal((await list('history')).count,0);
  let item=(await list()).items[0];assert.equal(item.category_name,'Books');
  for(const who of [owner,stranger,'']) {
   await identity(who,who?'authenticated':'anon');await assert.rejects(list());await assert.rejects(review(item.version,'approved'));
   if(who)assert.equal((await db.query('select * from report_review_history')).rows.length,0);else await assert.rejects(db.query('select * from report_review_history'));
  }
  await identity(admin);
  for(const reason of [null,' ','short','x'.repeat(1001)])await assert.rejects(review(item.version,'rejected',reason));
  assert.equal((await list()).items[0].status,'pending');assert.equal((await list('history')).count,0);
  await review(item.version,'rejected','Please remove the student ID visible in the photo.');
  let history=await list('history');assert.equal(history.count,1);assert.equal(history.items[0].reviewer_name,'Admin One');assert.equal(history.items[0].previous_status,'pending');
  await assert.rejects(review(item.version,'approved'),/changed/);
  await assert.rejects(db.query('delete from report_review_history'));
  await assert.rejects(db.query("update report_review_history set reason='tampered'"));
  console.log('PASS admin-only review/history, required reasons, atomic rejection, stale decisions and immutable history');
  await identity(owner);assert.match((await feedback())[0].reason,/student ID/);
  await identity(stranger);assert.equal((await feedback()).length,0);
  await identity(owner);
  const snapshot=(await db.query("select manage_own_report($1,'get') r",[id])).rows[0].r;
  await db.query("select manage_own_report($1,'edit',$2,$3::jsonb)",[id,snapshot.version,JSON.stringify({...snapshot.report,title:'Corrected notebook'})]);
  assert.equal((await feedback()).length,0);
  await identity(admin);assert.equal((await list('history')).count,1);item=(await list()).items[0];
  await review(item.version,'approved');assert.equal((await list('history')).count,2);
  await assert.rejects(db.query("update items set status='rejected' where id=$1",[id]),/rejection reason/);
  assert.equal((await list('history')).count,2);
  item=(await list('approved')).items[0];await review(item.version,'pending');
  assert.equal((await list('history')).count,3);
  // Older admin clients approving directly are still audited by the database trigger.
  await db.query("update items set status='approved' where id=$1",[id]);assert.equal((await list('history')).count,4);
  await identity(owner);
  const approved=(await db.query("select manage_own_report($1,'get') r",[id])).rows[0].r;
  await db.query("select manage_own_report($1,'return',$2)",[id,approved.version]);
  await identity(admin);assert.equal((await list('history')).count,4);
  await db.query('delete from items where id=$1',[id]);history=await list('history');assert.equal(history.count,4);assert.equal(history.items.at(-1).report_title,'Blue notebook');
  console.log('PASS owner-only feedback, edit/resubmit and return compatibility, direct-update auditing, history survives deletion');
  await db.exec('reset role');
  for(let i=0;i<14;i++)await db.query("insert into items(user_id,category_id,title,status,created_at) values($1,1,$2,'pending',$3)",[owner,'Report '+i,new Date(Date.UTC(2026,0,i+1)).toISOString()]);
  await identity(admin);const first=await list(),second=await list('pending',1);assert.equal(first.count,14);assert.equal(first.items.length,12);assert.equal(first.items[0].title,'Report 0');assert.equal(second.items.length,2);assert.equal(second.items[0].title,'Report 12');
  await assert.rejects(list('invalid'));await assert.rejects(list('pending',-1));
  await db.exec('reset role');await db.query("update profiles set role='user' where id=$1",[admin]);await identity(admin);await assert.rejects(list());
  console.log('PASS oldest-first pending queue, pagination, invalid filters and revoked admin access');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
