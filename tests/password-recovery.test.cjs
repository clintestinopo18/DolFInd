const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function dom(){const nodes=new Map();return id=>{if(!nodes.has(id))nodes.set(id,{value:'',hidden:true,disabled:false,handlers:{},textContent:'',addEventListener(name,fn){this.handlers[name]=fn;},focus(){},reportValidity(){return true;},reset(){for(const [key,n]of nodes)if(key.includes('password'))n.value='';}});return nodes.get(id);};}
function forgot(error=null){const get=dom(),calls=[],timers=[];vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/forgot-password.js'),'utf8'),{document:{getElementById:get},window:{supabaseClient:{auth:{resetPasswordForEmail:async(...args)=>{calls.push(args);return{error};}}}},location:{origin:'https://dolfind.vercel.app'},setTimeout:fn=>timers.push(fn)});return{get,calls,timers,submit:()=>get('forgot-form').handlers.submit({preventDefault(){}})};}
function reset({hash='#type=recovery&access_token=test-access&refresh_token=test-refresh',sessionError=null,updateError=null,delayed=false,signoutFailure=false}={}){
 const get=dom(),calls=[],events={},history=[];let createOptions,resolveSession,user={id:'owner',email:'student@pcu.edu.ph'};
 const auth={onAuthStateChange(fn){auth.callback=fn;},setSession:async tokens=>{calls.push(['setSession',tokens]);if(delayed)return new Promise(resolve=>{resolveSession=()=>resolve({});});return{error:sessionError};},getUser:async()=>({data:{user}}),updateUser:async values=>{calls.push(['updateUser',values]);return{data:{user},error:updateError};},signOut:async()=>{calls.push(['signOut']);if(signoutFailure)throw Error('Network');auth.callback('SIGNED_OUT');return{};},stopAutoRefresh(){}};
 const window={APP_CONFIG:{supabaseUrl:'https://project.example',supabasePublishableKey:'public-test'},supabase:{createClient:(url,key,opts)=>{createOptions=opts;return{auth};}},addEventListener(name,fn){events[name]=fn;}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/reset-password.js'),'utf8'),{window,document:{getElementById:get},location:{hash,pathname:'/reset-password.html'},history:{replaceState:(...args)=>history.push(args)},URLSearchParams});
 return{get,calls,events,history,options:()=>createOptions,resolve:()=>resolveSession(),changeUser:()=>{user={id:'other',email:'other@pcu.edu.ph'};},submit:()=>get('reset-form').handlers.submit({preventDefault(){}})};
}
test('reset email accepts only PCU addresses and uses the correct return page',async()=>{
 const p=forgot();p.get('recovery-email').value='student@example.com';await p.submit();assert.equal(p.calls.length,0);
 p.get('recovery-email').value=' Student@PCU.edu.ph ';await p.submit();assert.equal(p.calls[0][0],'student@pcu.edu.ph');assert.equal(p.calls[0][1].redirectTo,'https://dolfind.vercel.app/reset-password.html');assert.match(p.get('recovery-message').textContent,/If an account exists/);
 await p.submit();assert.equal(p.calls.length,1);p.timers[0]();await p.submit();assert.equal(p.calls.length,2);
});
test('email rate limits wait before retrying; other errors allow retry without exposing account details',async()=>{
 for(const error of [{status:429},{message:'private backend detail'}]){const p=forgot(error);p.get('recovery-email').value='student@pcu.edu.ph';await p.submit();assert.equal(p.get('send-reset').disabled,error.status===429);assert.doesNotMatch(p.get('recovery-message').textContent,/private backend/);}
});
test('missing or expired reset links never enable password updates',async()=>{
 for(const options of [{hash:''},{hash:'#error=access_denied&error_code=otp_expired'},{sessionError:{message:'Expired'}}]){const p=reset(options);await flush();assert.equal(p.get('reset-form').hidden,true);assert.equal(p.get('reset-retry').hidden,false);await p.submit();assert.equal(p.calls.filter(c=>c[0]==='updateUser').length,0);}
});
test('recovery isolates the session, removes URL credentials, and verifies the account',async()=>{
 const p=reset();await flush();assert.equal(p.options().auth.persistSession,false);assert.equal(p.options().auth.detectSessionInUrl,false);assert.equal(p.history[0][2],'/reset-password.html');assert.equal(p.get('reset-form').hidden,false);assert.match(p.get('reset-intro').textContent,/student@pcu.edu.ph/);
});
test('password length and confirmation are checked before updating',async()=>{
 const p=reset();await flush();p.get('new-password').value='short';p.get('confirm-new-password').value='short';await p.submit();p.get('new-password').value='Long-password-123';p.get('confirm-new-password').value='mismatch';await p.submit();assert.equal(p.calls.filter(c=>c[0]==='updateUser').length,0);assert.match(p.get('reset-message').textContent,/do not match/);
});
test('successful reset saves once, clears passwords and offers login even if cleanup fails',async()=>{
 for(const signoutFailure of [false,true]){const p=reset({signoutFailure});await flush();p.get('new-password').value=p.get('confirm-new-password').value='New-password-123';await p.submit();await p.submit();assert.equal(p.calls.filter(c=>c[0]==='updateUser').length,1);assert.equal(p.get('new-password').value,'');assert.equal(p.get('reset-form').hidden,true);assert.equal(p.get('reset-success').hidden,false);assert.match(p.get('reset-message').textContent,/now log in/);}
});
test('a changed account cannot receive a password meant for the recovery account',async()=>{
 const p=reset();await flush();p.get('new-password').value=p.get('confirm-new-password').value='New-password-123';p.changeUser();await p.submit();assert.equal(p.calls.filter(c=>c[0]==='updateUser').length,0);assert.equal(p.get('reset-retry').hidden,false);
});
test('failed password updates never show a success state',async()=>{
 const p=reset({updateError:{code:'same_password'}});await flush();p.get('new-password').value=p.get('confirm-new-password').value='New-password-123';await p.submit();assert.equal(p.get('reset-success').hidden,true);assert.match(p.get('reset-message').textContent,/different/);assert.equal(p.get('save-password').disabled,false);
});
test('leaving the reset page prevents a late session response from restoring the form',async()=>{
 const p=reset({delayed:true});p.events.pagehide();p.resolve();await flush();assert.equal(p.get('reset-form').hidden,true);assert.equal(p.get('reset-intro').textContent,'');
});
