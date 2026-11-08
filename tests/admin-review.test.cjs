const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function setup({role='admin',delayed=false,reviewError=null}={}) {
 const elements=new Map(),calls=[],events={};let authChange,resolveList,user={id:'admin'},item={id:42,title:'Blue notebook',description:'Notebook with a red cover',item_type:'lost',status:'pending',location:'Library',event_date:'2026-01-01',created_at:'2026-01-01T00:00:00Z',category_name:'Books',image_url:'owner/photo.jpg',version:'snapshot'};
 const entry={item_id:42,report_title:'<img src=x onerror=alert(1)>',reviewer_name:'Admin One',previous_status:'pending',new_status:'rejected',reason:'Please add a clear description.',reviewed_at:'2026-01-01T00:00:00Z'};
 function element(){return {children:[],handlers:{},attributes:{},textContent:'',value:'',hidden:false,disabled:false,isConnected:true,parentElement:{},addEventListener(name,fn){this.handlers[name]=fn;},setAttribute(k,v){this.attributes[k]=v;},append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;},querySelectorAll(){return [];},focus(){},showModal(){this.open=true;},close(){this.open=false;this.handlers.close?.();}};}
 const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};get('admin-status').value='pending';
 const client={auth:{getUser:async()=>({data:{user}}),onAuthStateChange(fn){authChange=fn;}},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{role}})})})}),rpc:async(name,args)=>{
  calls.push({name,args});
  if(name==='admin_review_list') {
   const response={data:args.p_view==='history'?{items:[entry],count:1}:{items:item.status===args.p_view?[{...item}]:[],count:item.status===args.p_view?1:0}};
   if(delayed)return new Promise(resolve=>{resolveList=()=>resolve(response);});return response;
  }
  if(reviewError)return {error:{message:reviewError}};
  item.status=args.p_status;return {data:{id:42,status:item.status}};
 }};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/admin.js'),'utf8'),{document:{getElementById:get,createElement:element},window:{supabaseClient:client,reportPhotos:{mount(){}},addEventListener(name,fn){events[name]=fn;}},setTimeout,Date});
 const descendants=node=>[node,...node.children.flatMap(descendants)];
 return {get,calls,events,button:text=>descendants(get('admin-grid')).find(n=>n.textContent===text),submit:()=>get('review-dialog-form').handlers.submit({preventDefault(){}}),logout:()=>{user=null;authChange('SIGNED_OUT');},resolve:()=>resolveList()};
}
test('non-admin users cannot load the queue or history',async()=>{
 const page=setup({role:'user'});await flush();assert.equal(page.get('admin-content').hidden,true);assert.equal(page.calls.length,0);
});
test('the default queue is pending and cancel never submits a review',async()=>{
 const page=setup();await flush();assert.equal(page.calls[0].args.p_view,'pending');
 page.button('Approve').handlers.click();assert.equal(page.get('review-dialog').open,true);page.get('review-cancel').handlers.click();await page.submit();
 assert.equal(page.calls.filter(c=>c.name==='review_report').length,0);
});
test('rejecting requires a useful reason and saves the reviewed snapshot once',async()=>{
 const page=setup();await flush();page.button('Reject with reason').handlers.click();
 page.get('review-reason').value='  ';await page.submit();assert.equal(page.calls.filter(c=>c.name==='review_report').length,0);
 page.get('review-reason').value='Please add a clearer description.';await page.submit();await page.submit();
 const calls=page.calls.filter(c=>c.name==='review_report');assert.equal(calls.length,1);assert.equal(calls[0].args.p_expected,'snapshot');assert.equal(calls[0].args.p_reason,'Please add a clearer description.');
 assert.equal(page.get('review-dialog').open,false);assert.match(page.get('admin-message').textContent,/added to history/);assert.equal(page.get('admin-grid').children[0].children[0].textContent,'No reports waiting for review');
});
test('a failed review retains the reason and does not claim success',async()=>{
 const page=setup({reviewError:'The report changed.'});await flush();page.button('Reject with reason').handlers.click();page.get('review-reason').value='Please remove private information.';await page.submit();
 assert.equal(page.get('review-dialog').open,true);assert.equal(page.get('review-reason').value,'Please remove private information.');assert.match(page.get('review-dialog-message').textContent,/changed/);assert.doesNotMatch(page.get('admin-message').textContent,/added to history/);
});
test('history displays saved titles, reasons and reviewer names as text',async()=>{
 const page=setup();await flush();page.get('admin-history-view').handlers.click();await flush();
 assert.equal(page.calls.at(-1).args.p_view,'history');assert.equal(page.get('admin-status').parentElement.hidden,true);
 const card=page.get('admin-grid').children[0];assert.equal(card.children[1].textContent,'<img src=x onerror=alert(1)>');assert.match(card.children[3].textContent,/Admin One/);assert.equal(card.children[4].textContent,'Please add a clear description.');
});
test('logout clears private content and late queue results cannot restore it',async()=>{
 const page=setup({delayed:true});await flush();page.logout();page.resolve();await flush();
 assert.equal(page.get('admin-content').hidden,true);assert.equal(page.get('admin-grid').children.length,0);assert.equal(page.get('review-dialog-name').textContent,'');
});
