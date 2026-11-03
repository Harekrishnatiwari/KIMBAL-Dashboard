const S = v => String(v ?? '').trim();
const clean = v => S(v).toUpperCase();
const key = v => S(v).toLowerCase().replace(/[^a-z0-9]/g, '');
export const AGE_BINS=['Less than 3 Days','3-5 Days','6-10 Days','11-30 Days','More than 30 Days','#N/A'];
export const WINDOWS={All:24,'1 Hour':1,'4 Hours':4,'12 Hours':12,'24 Hours':24,'3 Days':72,'5 Days':120,'7 Days':168};
export const empty = () => ({meter:'',consumer:'',zone:'#N/A',circle:'',division:'',subDivision:'',install:'',commAt:'',status:'Never Comm',commType:'RF',sat:'NONSAT',remark:'#N/A',contractor:'',gateway:'',node:'',source:'MI'});
const aliases={
  meter:['Meter Number','Meter No','Meter','Meternumber','New Meter Number','New Meter QR Code','MeterNo'],
  consumer:['Consumer Number','Application ID'], zone:['Zone'], circle:['Circle'],division:['Division'],subDivision:['Sub-Division','Subdivision','Sub Division'],
  install:['Installation Date','New Meter Installed Date','Installed Date'],commAt:['Communicated At','Last Communicated At','Last Communication Time','Last Communicated Time'],
  status:['Comm Status','Communication Status'],commType:['Communication Type','Meter Communication Type','communication Type'],
  sat:['SAT Flag','SAT No','SAT Status'],remark:['Observation/Action Plan','Observation / Action Plan','Remarks','Remark'],
  contractor:['Contractor Name'],gateway:['Gateway Serial No','Gateway ID','Gateway Number','Gateway'],node:['Node Id','NodeId','Node ID'],source:['Styra Status','Source']
};
export function field(obj,name) {const keys=Object.keys(obj||{}), all=aliases[name]||[name];for(const a of all){const found=keys.find(k=>key(k)===key(a));if(found!==undefined) return S(obj[found]);}return '';}
export function normalize(obj,source='MI'){
 const x=empty();for(const name of Object.keys(x)) if(name!=='source') x[name]=field(obj,name)||x[name];
 x.meter=clean(x.meter);x.source=field(obj,'source')||source;x.sat=x.sat==='#N/A'?'NONSAT':(x.sat||'NONSAT');
 x.commType=/\b(RF|RADIO)\b/i.test(x.commType)?'RF':(/GPRS|TCP|CELL|GSM|4G|NB.?IOT|LTE/i.test(x.commType)?'GPRS':'RF');
 x.status= /never/i.test(x.status)?'Never Comm':(/non\s*comm/i.test(x.status)?'Non Comm':(/communi/i.test(x.status)?'Communicating':'Never Comm'));
 if(x.status==='Communicating') x.remark='#N/A'; return x;
}
// UTC milliseconds. Naive routing/file timestamps are explicitly treated as IST, not host local timezone.
export function dateMs(raw){
 if(raw instanceof Date) return Number(raw);
 let s=S(raw);if(!s||s==='#N/A')return NaN;
 if(/^\d{4}-\d{2}-\d{2}T/.test(s) && /(Z|[+-]\d{2}:?\d{2})$/i.test(s))return Date.parse(s);
 let m=s.match(/^(\d{4})[-/](\d\d?)[-/](\d\d?)(?:[ T](\d\d?):(\d\d?)(?::(\d\d?))?)?/);
 if(m) return Date.parse(`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}T${(m[4]||'00').padStart(2,'0')}:${(m[5]||'00').padStart(2,'0')}:${(m[6]||'00').padStart(2,'0')}+05:30`);
 m=s.match(/^(\d\d?)[-/](\d\d?)[-/](\d{4})(?:[ T](\d\d?):(\d\d?)(?::(\d\d?))?)?/);
 if(m)return Date.parse(`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}T${(m[4]||'00').padStart(2,'0')}:${(m[5]||'00').padStart(2,'0')}:${(m[6]||'00').padStart(2,'0')}+05:30`);
 return NaN;
}
export function timeStatus(commAt,cutoffMs=Date.now(),hours=24){const t=dateMs(commAt);if(!Number.isFinite(t))return 'Never Comm';const gap=cutoffMs-t;if(gap<0)return 'Non Comm';return gap<=hours*3600000?'Communicating':'Non Comm';}
export function ageGroup(row,cutoffMs=Date.now()){
 const ref=row.status==='Non Comm'?row.commAt:(row.status==='Never Comm'?row.install:null);if(!ref)return '#N/A';const ts=dateMs(ref);if(!Number.isFinite(ts))return '#N/A';
 const days=Math.floor((cutoffMs-ts)/86400000);if(days<0)return '#N/A';return days<3?AGE_BINS[0]:days<=5?AGE_BINS[1]:days<=10?AGE_BINS[2]:days<=30?AGE_BINS[3]:AGE_BINS[4];
}
export function applyRouting(rows,routing,cutoffMs=Date.now()){
 const map=new Map();for(const r of routing){const meter=clean(field(r,'meter'));const time=field(r,'commAt');const t=dateMs(time);if(meter&&Number.isFinite(t)&&(!map.has(meter)||t>map.get(meter).t))map.set(meter,{t,time,gate:field(r,'gateway'),node:field(r,'node')});}
 return rows.map(row=>{const r=map.get(row.meter);const next={...row,commAt:r?.time||'',gateway:r?.gate||row.gateway,node:r?.node||row.node,status:timeStatus(r?.time||'',cutoffMs)};if(next.status==='Communicating')next.remark='#N/A';return next;});
}
export function mergeMiNsc(mi,nsc){const map=new Map();for(const [items,label] of [[nsc,'NSC'],[mi,'MI']])for(const o of items){const r=normalize(o,label);if(r.meter)map.set(r.meter,r);}return [...map.values()];}
export function applyNameplate(rows,records){const map=new Map();for(const o of records){const meter=clean(field(o,'meter'));if(meter)map.set(meter,o);}return rows.map(r=>{const p=map.get(r.meter);if(!p)return r;return {...r,sat:field(p,'sat')||r.sat,commType:field(p,'commType')?normalize({"Communication Type":field(p,'commType')}).commType:r.commType,node:field(p,'node')||r.node};});}
export function carryRemarks(rows,previous){const remarks=new Map();for(const r of previous||[])if(r.remark&&r.remark!=='#N/A')remarks.set(r.meter,r.remark);return rows.map(r=>({...r,remark:r.status==='Communicating'?'#N/A':(r.remark&&r.remark!=='#N/A'?r.remark:(remarks.get(r.meter)||'#N/A'))}));}
export function counts(rows){const out={Total:rows.length,Communicating:0,'Non Comm':0,'Never Comm':0};for(const r of rows)out[r.status]=(out[r.status]||0)+1;return out;}
export function group(rows,groupBy){const tally=new Map();for(const r of rows){const name=S(groupBy(r))||'#N/A';if(!tally.has(name))tally.set(name,{name,Total:0,Communicating:0,'Non Comm':0,'Never Comm':0});const obj=tally.get(name);obj.Total++;obj[r.status]=(obj[r.status]||0)+1;}return [...tally.values()].sort((a,b)=>b.Total-a.Total);}
export function commForWindow(rows,hours,cutoffMs){return rows.map(r=>({...r,status:timeStatus(r.commAt,cutoffMs,hours),remark:timeStatus(r.commAt,cutoffMs,hours)==='Communicating'?'#N/A':r.remark}));}
export function remarkRows(rows,type,status){return rows.filter(r=>r.commType===type&&r.status===status&&r.status!=='Communicating');}
export function countRemarks(rows){const map=new Map();for(const r of rows){const k=r.remark||'#N/A';map.set(k,(map.get(k)||0)+1);}return [...map.entries()].map(([name,auto])=>({name,auto})).sort((a,b)=>b.auto-a.auto);}
export function csvParse(source){const text=String(source).replace(/^\uFEFF/,'');const lines=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){let c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v!==''))lines.push(row);row=[];cell='';}else cell+=c;}row.push(cell);if(row.some(v=>v!==''))lines.push(row);const heads=lines.shift()||[];return lines.map(values=>Object.fromEntries(heads.map((h,i)=>[h.trim(),values[i]??''])));}
export function csvExport(rows){if(!rows.length)return 'Meter Number,Comm Status\r\n';const headers=Object.keys(rows[0]);const q=v=>`"${String(v??'').replace(/"/g,'""')}"`;return [headers.join(','),...rows.map(row=>headers.map(h=>q(row[h])).join(','))].join('\r\n');}
export function istDate(ms){return new Date(ms+330*60000).toISOString().replace('T',' ').slice(0,19);}
