"use client";
import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardList, RefreshCw } from 'lucide-react';
import { useAdmin } from '@/components/admin/AdminShell';
import { Alert, Badge, Button, Card, Input, PageHeader, Section, Select } from '@/components/admin/ui';

const STATUSES = ['unverified','in_progress','blocked','complete'];
const MATURITY = ['tentative','proposed','approved'];
const pretty = x => x.replaceAll('_',' ');
export default function RolloutPage() {
  const { call } = useAdmin();
  const [items,setItems]=useState([]);
  const [filter,setFilter]=useState('all');
  const [selected,setSelected]=useState(null);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const load=useCallback(async()=>{try{const data=await call('/admin/rollout/items');setItems(data.items);setError('');}catch(e){setError(e.message)}},[call]);
  useEffect(()=>{load()},[load]);
  const edit=(item)=>{setSelected({...item});setMessage('');setError('')};
  const change=(key,value)=>setSelected(s=>({...s,[key]:value}));
  const save=async(e)=>{
    e.preventDefault();setBusy(true);setMessage('');
    try{
      const {id,updated_at,...body}=selected;
      await call(`/admin/rollout/items/${id}`,{method:'PATCH',body});
      setSelected(null);setMessage(`${id} saved with audit history.`);await load();
    }catch(err){setError(err.message)}finally{setBusy(false)}
  };
  const shown=items.filter(x=>filter==='all'||x.status===filter);
  return <div className="space-y-6">
    <PageHeader eyebrow="Delivery" title="Graphics & pilot rollout" icon={ClipboardList} description="Engineering backlog, not a release certification. All reserved graphics IDs begin tentative and unverified." actions={<><Button href="/admin/pilot" variant="ghost">Pilot metrics</Button><Button onClick={load} icon={RefreshCw}>Refresh</Button></>}/>
    {error&&<Alert tone="error">{error}</Alert>}
    {message&&<Alert tone="success">{message}</Alert>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {STATUSES.map(s=><Card key={s} className="p-4"><p className="text-xs text-sx-muted capitalize">{pretty(s)}</p><p className="mt-1 text-2xl font-bold text-white">{items.filter(x=>x.status===s).length}</p></Card>)}
    </div>
    <Section title="VV-GFX backlog" description="Execution status and planning maturity are independent. Do not mark complete without evidence and a test result." actions={<label className="flex items-center gap-2 text-sm text-slate-200">Status <Select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All</option>{STATUSES.map(s=><option key={s} value={s}>{pretty(s)}</option>)}</Select></label>}>
      <div className="space-y-2">
        {shown.map(item=><div key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-sx-stroke p-3">
          <span className="min-w-0 flex-1"><span className="block font-mono text-xs text-sx-cyan">{item.id}</span><span className="block text-sm font-semibold text-white">{item.title}</span><span className="block text-xs text-sx-muted">{item.owner||'No owner assigned'}{item.blocker?' · Blocked: '+item.blocker:''}</span></span>
          <Badge tone={item.status==='complete'?'green':item.status==='blocked'?'red':'neutral'}>{pretty(item.status)}</Badge>
          <Badge tone={item.maturity==='approved'?'green':'amber'}>{item.maturity}</Badge>
          <Button size="sm" onClick={()=>edit(item)}>Edit</Button>
        </div>)}
      </div>
    </Section>
    {selected&&<Section title={`Edit ${selected.id}`} description="Changes persist in the API database and are audited.">
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        {['title','owner','blocker','description','test_result','evidence_url'].map(key=><label key={key} className={key==='description'?'sm:col-span-2':'block'}><span className="mb-1 block text-sm capitalize text-slate-200">{pretty(key)}</span><Input value={selected[key]} onChange={e=>change(key,e.target.value)} maxLength={key==='title'?160:key==='owner'?120:key==='evidence_url'?1000:2000}/></label>)}
        <label className="text-sm text-slate-200">Execution status<Select className="mt-1 w-full" value={selected.status} onChange={e=>change('status',e.target.value)}>{STATUSES.map(s=><option key={s} value={s}>{pretty(s)}</option>)}</Select></label>
        <label className="text-sm text-slate-200">Planning maturity<Select className="mt-1 w-full" value={selected.maturity} onChange={e=>change('maturity',e.target.value)}>{MATURITY.map(s=><option key={s} value={s}>{s}</option>)}</Select></label>
        <label className="sm:col-span-2 text-sm text-slate-200">Dependencies (comma-separated VV-GFX IDs)<Input className="mt-1" value={selected.dependencies.join(', ')} onChange={e=>change('dependencies',e.target.value.split(',').map(x=>x.trim()).filter(Boolean))}/></label>
        <div className="flex gap-2 sm:col-span-2"><Button type="submit" variant="primary" disabled={busy}>{busy?'Saving…':'Save changes'}</Button><Button onClick={()=>setSelected(null)}>Cancel</Button></div>
      </form>
    </Section>}
  </div>;
}
