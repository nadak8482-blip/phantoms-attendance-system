// Phantoms Attendance System — Supabase browser client.
// Never put a service_role key in frontend code.
const SUPABASE_URL = 'https://okswrkqpmxcvfdatjlqb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_aQVQLirzgRp6-B8boJQUMA_7EJisUk8';
const configured = SUPABASE_URL.startsWith('https://') && !SUPABASE_URL.includes('PASTE_') && !SUPABASE_ANON_KEY.includes('PASTE_');
const db = configured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const $ = (id) => document.getElementById(id);
let currentUser = null, currentProfile = null, currentQrLink = '', reportRows = [];

function show(id, yes=true){ $(id).classList.toggle('hidden', !yes); }
function message(id, text, type=''){ const el=$(id); el.textContent=text; el.className='message'+(type?' '+type:''); }
function fmtDate(value){ return new Date(value).toLocaleString([], {dateStyle:'medium',timeStyle:'short'}); }
function esc(value=''){ return String(value).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function statusForEvent(event){ const now=Date.now(); if(new Date(event.starts_at).getTime()>now) return ['Upcoming · قادمة','upcoming']; if(new Date(event.ends_at).getTime()<now) return ['Closed · منتهية','closed']; return ['Open · مفتوحة','open']; }

async function init(){
  if(!configured){ show('setup-notice'); return; }
  $('login-form').addEventListener('submit', login);
  $('logout-btn').addEventListener('click', logout);
  $('event-form').addEventListener('submit', createEvent);
  $('refresh-btn').addEventListener('click', loadAdminData);
  $('copy-link-btn').addEventListener('click', async()=>{ try{await navigator.clipboard.writeText(currentQrLink); $('copy-link-btn').textContent='Copied! · تم النسخ'; setTimeout(()=>$('copy-link-btn').textContent='Copy check-in link · نسخ الرابط',1500);}catch{message('event-message','Copy failed. Copy this link manually: '+currentQrLink,'error');} });
  $('checkin-btn').addEventListener('click', checkIn);
  $('report-search').addEventListener('input', renderReportTable);
  $('report-type').addEventListener('change', loadReports);
  $('export-report-btn').addEventListener('click', exportReport);
  const {data:{session}} = await db.auth.getSession();
  db.auth.onAuthStateChange((_event,session)=>{ setTimeout(()=>session ? enterApp(session.user) : showLoggedOut(),0); });
  if(session) await enterApp(session.user); else showLoggedOut();
}
function showLoggedOut(){ currentUser=null; currentProfile=null; show('auth-view'); show('admin-view',false); show('member-view',false); show('logout-btn',false); $('user-label').textContent=''; }
async function login(e){ e.preventDefault(); message('auth-message','Signing in… · جارٍ تسجيل الدخول'); const {error}=await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value}); if(error) message('auth-message',error.message,'error'); }
async function logout(){ await db.auth.signOut(); }
async function enterApp(user){
  currentUser=user; const {data:profile,error}=await db.from('profiles').select('id,full_name,team,role,active,created_at').eq('id',user.id).maybeSingle();
  if(error || !profile || !profile.active){ message('auth-message','Your profile is not active yet. Ask HR to add/activate your profile. · الحساب غير مفعّل، تواصلي مع HR.','error'); await db.auth.signOut(); return; }
  currentProfile=profile; show('auth-view',false); show('logout-btn'); $('user-label').textContent=profile.full_name||user.email;
  const eventId=new URLSearchParams(location.search).get('event');
  if(profile.role==='admin'){ show('admin-view'); show('member-view',false); await loadAdminData(); }
  else { show('admin-view',false); show('member-view'); await loadCheckinEvent(eventId); }
}
async function loadCheckinEvent(eventId){
  if(!eventId){ $('checkin-title').textContent='Scan an event QR code · امسحي كود الفعالية'; $('checkin-description').textContent='Open the unique check-in link shared for your meeting or event. · افتحي رابط الحضور الخاص بالاجتماع أو الفعالية.'; show('checkin-btn',false); return; }
  const {data:event,error}=await db.from('events').select('id,title,event_type,starts_at,ends_at,late_after_minutes').eq('id',eventId).maybeSingle();
  if(error||!event){ $('checkin-title').textContent='Event not found · الفعالية غير موجودة'; $('checkin-description').textContent='This QR link may be incorrect or the event is unavailable. · رابط QR غير صحيح أو الفعالية غير متاحة.'; show('checkin-btn',false); return; }
  $('checkin-title').textContent=event.title; const now=Date.now();
  if(now<new Date(event.starts_at).getTime()){ $('checkin-description').textContent='Check-in opens · يبدأ التسجيل: '+fmtDate(event.starts_at); show('checkin-btn',false); }
  else if(now>new Date(event.ends_at).getTime()){ $('checkin-description').textContent='Check-in closed · انتهى التسجيل: '+fmtDate(event.ends_at); show('checkin-btn',false); }
  else { $('checkin-description').textContent='You are signing in as · تسجيل الحضور باسم: '+(currentProfile.full_name||currentUser.email)+'. Tap below to confirm. · اضغطي للتأكيد.'; show('checkin-btn'); }
  $('checkin-btn').dataset.eventId=event.id; message('checkin-message','');
}
async function checkIn(){
  const eventId=$('checkin-btn').dataset.eventId; if(!eventId||!currentUser) return;
  $('checkin-btn').disabled=true; message('checkin-message','Recording attendance… · جارٍ تسجيل الحضور');
  const {data,error}=await db.rpc('check_in_to_event',{p_event_id:eventId}); $('checkin-btn').disabled=false;
  if(error){ message('checkin-message',error.message,'error'); return; }
  message('checkin-message',(data?.message||'Attendance recorded successfully.')+' · تم تسجيل الحضور.', 'success'); show('checkin-btn',false);
}
async function createEvent(e){
  e.preventDefault(); message('event-message','Creating event… · جارٍ إنشاء الفعالية');
  const start=new Date($('event-start').value), end=new Date($('event-end').value), lateAfter=Number($('late-after').value);
  if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start){ message('event-message','Choose a valid end time after the start time. · اختاري وقت انتهاء بعد وقت البداية.','error'); return; }
  if(!Number.isInteger(lateAfter)||lateAfter<0||lateAfter>180){ message('event-message','Late threshold must be between 0 and 180 minutes. · حد التأخير من 0 إلى 180 دقيقة.','error'); return; }
  const {data,error}=await db.from('events').insert({title:$('event-name').value.trim(),event_type:$('event-type').value,starts_at:start.toISOString(),ends_at:end.toISOString(),late_after_minutes:lateAfter,created_by:currentUser.id}).select().single();
  if(error){ message('event-message',error.message,'error'); return; }
  currentQrLink=location.origin+location.pathname+'?event='+data.id;
  $('qr-code').innerHTML=''; new QRCode($('qr-code'),{text:currentQrLink,width:170,height:170,colorDark:'#e63946',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.H});
  $('qr-title').textContent=data.title; $('qr-description').textContent='Share this QR with members at the event. They must sign in first. · شاركي الكود مع الأعضاء، ويلزم تسجيل الدخول.'; show('copy-link-btn'); $('open-link').href=currentQrLink; show('open-link'); message('event-message','Event created and QR generated. · تم إنشاء الفعالية وكود QR.','success');
  $('event-form').reset(); $('late-after').value='10'; await loadAdminData();
}
async function loadAdminData(){
  const [membersRes,eventsRes,attendanceRes]=await Promise.all([
    db.from('profiles').select('id',{count:'exact',head:true}).eq('active',true),
    db.from('events').select('*').order('starts_at',{ascending:false}).limit(500),
    db.from('attendance').select('id',{count:'exact',head:true})
  ]);
  if(membersRes.error||eventsRes.error||attendanceRes.error){ message('event-message','Could not load dashboard data. Check database setup and RLS policies. · تعذّر تحميل البيانات؛ راجعي إعدادات قاعدة البيانات والصلاحيات.','error'); return; }
  $('stat-members').textContent=membersRes.count??0; $('stat-events').textContent=eventsRes.data.length; $('stat-checkins').textContent=attendanceRes.count??0;
  const events=eventsRes.data||[]; let counts={};
  if(events.length){const ids=events.map(x=>x.id);const {data:att}=await db.from('attendance').select('event_id').in('event_id',ids);(att||[]).forEach(x=>counts[x.event_id]=(counts[x.event_id]||0)+1);}
  $('events-table').innerHTML=events.length?events.map(ev=>{const [label,cls]=statusForEvent(ev);const type=ev.event_type==='meeting'?'Meeting · اجتماع':'Event · فعالية';return `<tr><td><strong>${esc(ev.title)}</strong></td><td>${type}</td><td>${fmtDate(ev.starts_at)}<br><span class="muted">to · إلى ${fmtDate(ev.ends_at)}</span></td><td>${counts[ev.id]||0}</td><td><span class="status ${cls}">${label}</span></td></tr>`}).join(''):'<tr><td colspan="5" class="muted">No events yet · لا توجد فعاليات بعد.</td></tr>';
  const {data:recent,error}=await db.from('attendance').select('checked_in_at,status,profiles(full_name),events(title)').order('checked_in_at',{ascending:false}).limit(30);
  $('attendance-table').innerHTML=error?'<tr><td colspan="4" class="muted">Could not load recent check-ins · تعذّر تحميل التسجيلات.</td></tr>':recent.length?recent.map(a=>`<tr><td>${esc(a.profiles?.full_name||'Member')}</td><td>${esc(a.events?.title||'Event')}</td><td>${fmtDate(a.checked_in_at)}</td><td><span class="status ${a.status==='late'?'late':'present'}">${a.status==='late'?'Late · متأخر':'Present · حاضر'}</span></td></tr>`).join(''):'<tr><td colspan="4" class="muted">No check-ins recorded yet · لا توجد تسجيلات بعد.</td></tr>';
  await loadReports();
}
async function loadReports(){
  const [membersRes,eventsRes,attendanceRes]=await Promise.all([
    db.from('profiles').select('id,full_name,team,created_at').eq('active',true).order('full_name'),
    db.from('events').select('id,title,event_type,starts_at,ends_at').lt('ends_at',new Date().toISOString()).order('ends_at',{ascending:false}).limit(1000),
    db.from('attendance').select('member_id,event_id,status,checked_in_at').limit(5000)
  ]);
  if(membersRes.error||eventsRes.error||attendanceRes.error){ $('report-table').innerHTML='<tr><td colspan="7" class="muted">Unable to load reports. Check admin access and database policies. · تعذّر تحميل التقارير.</td></tr>'; return; }
  const members=membersRes.data||[], completedAll=eventsRes.data||[], attendanceAll=attendanceRes.data||[];
  const makeRows=(completed)=>members.map(member=>{
    const joined=new Date(member.created_at||0).getTime();
    const eligible=completed.filter(ev=>new Date(ev.ends_at).getTime()>=joined);
    const eligibleIds=new Set(eligible.map(ev=>ev.id));
    const records=attendanceAll.filter(a=>a.member_id===member.id && eligibleIds.has(a.event_id));
    const attended=new Set(records.map(a=>a.event_id)).size, absent=Math.max(0,eligible.length-attended), late=records.filter(a=>a.status==='late').length;
    return {name:member.full_name||'Member',team:member.team||'—',eligible:eligible.length,attended,absent,late,rate:eligible.length?Math.round(attended/eligible.length*100):null};
  });
  const allRows=makeRows(completedAll);
  const eligibleTotal=allRows.reduce((n,r)=>n+r.eligible,0), attendedTotal=allRows.reduce((n,r)=>n+r.attended,0);
  $('stat-rate').textContent=eligibleTotal?Math.round(attendedTotal/eligibleTotal*100)+'%':'—';
  const type=$('report-type').value;
  reportRows=makeRows(completedAll.filter(ev=>type==='all'||ev.event_type===type));
  renderReportTable();
}
function filteredReportRows(){
  const q=$('report-search').value.trim().toLocaleLowerCase();
  return reportRows.filter(r=>(r.name+' '+r.team).toLocaleLowerCase().includes(q));
}
function renderReportTable(){
  if(!$('report-table')) return;
  const rows=filteredReportRows();
  $('report-table').innerHTML=rows.length?rows.map(r=>`<tr><td><strong>${esc(r.name)}</strong></td><td>${esc(r.team)}</td><td>${r.eligible}</td><td>${r.attended}</td><td><span class="status ${r.absent?'absent':'present'}">${r.absent}</span></td><td><span class="status ${r.late?'late':'present'}">${r.late}</span></td><td><strong class="${r.rate!==null&&r.rate<70?'rate-low':''}">${r.rate===null?'—':r.rate+'%'}</strong></td></tr>`).join(''):'<tr><td colspan="7" class="muted">No matching members · لا يوجد أعضاء مطابقون.</td></tr>';
}
function exportReport(){
  const rows=filteredReportRows();
  if(!rows.length){ message('event-message','No report rows to export. · لا توجد بيانات لتصديرها.','error'); return; }
  const csvRows=[['Member','Committee','Completed events','Attended','Absent','Late','Attendance rate'],...rows.map(r=>[r.name,r.team,r.eligible,r.attended,r.absent,r.late,r.rate===null?'N/A':r.rate+'%'])];
  const csv='\uFEFF'+csvRows.map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'})); const a=document.createElement('a'); a.href=url; a.download='phantoms-attendance-report.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
init().catch(err=>{console.error(err); show('setup-notice');});
