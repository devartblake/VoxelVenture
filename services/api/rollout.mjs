// Internal rollout backlog. All records start unverified/tentative; no implied release approval.
import { ApiError } from './core.mjs';
const statuses = new Set(['unverified','in_progress','blocked','complete']);
const maturities = new Set(['tentative','proposed','approved']);
const fields = ['title','description','status','maturity','owner','blocker','dependencies','test_result','evidence_url'];
const textField = (v, max=2000) => typeof v === 'string' && v.length <= max;
function validate(body, existing) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400,'Invalid item','bad_item');
  if (Object.keys(body).some(k=>!fields.includes(k))) throw new ApiError(400,'Unknown field','bad_item');
  const out = {...existing, ...body};
  if (!textField(out.title,160) || !out.title.trim() || !textField(out.description) || !textField(out.owner,120) || !textField(out.blocker) || !textField(out.test_result,1000) || !textField(out.evidence_url,1000)) throw new ApiError(400,'Invalid field','bad_item');
  if (!statuses.has(out.status) || !maturities.has(out.maturity)) throw new ApiError(400,'Invalid status','bad_status');
  if (!Array.isArray(out.dependencies) || out.dependencies.length>20 || out.dependencies.some(d=>!/^VV-GFX-(0[1-9]|1[0-3])$/.test(d))) throw new ApiError(400,'Invalid dependencies','bad_dependencies');
  if (out.evidence_url && (!/^https:\/\//.test(out.evidence_url) || (()=>{try{return !['https:'].includes(new URL(out.evidence_url).protocol)}catch{return true}})())) throw new ApiError(400,'Evidence URL must be HTTPS','bad_evidence');
  if (out.status==='complete' && (!out.evidence_url || !out.test_result.trim())) throw new ApiError(400,'Completion requires evidence and a test result','missing_evidence');
  return out;
}
const decode = row => ({...row,dependencies:JSON.parse(row.dependencies)});
export function list(db) {
  return db.prepare('SELECT * FROM rollout_items ORDER BY id').all().map(decode);
}
export function update(db,id,body) {
  if (!/^VV-GFX-(0[1-9]|1[0-3])$/.test(id)) throw new ApiError(404,'Not found','not_found');
  const old=db.prepare('SELECT * FROM rollout_items WHERE id=?').get(id);
  if (!old) throw new ApiError(404,'Not found','not_found');
  const next=validate(body,decode(old));
  if (next.dependencies.includes(id)) throw new ApiError(400,'Circular dependency','bad_dependencies');
  const graph=new Map(list(db).map(x=>[x.id,x.dependencies]));
  graph.set(id,next.dependencies);
  const visit=(node,stack=new Set())=>{
    if(stack.has(node)) return true;
    const s=new Set(stack);s.add(node);
    return (graph.get(node)||[]).some(d=>visit(d,s));
  };
  if (visit(id)) throw new ApiError(400,'Circular dependency','bad_dependencies');
  db.prepare('UPDATE rollout_items SET title=?,description=?,status=?,maturity=?,owner=?,blocker=?,dependencies=?,test_result=?,evidence_url=?,updated_at=? WHERE id=?').run(next.title,next.description,next.status,next.maturity,next.owner,next.blocker,JSON.stringify(next.dependencies),next.test_result,next.evidence_url,Date.now(),id);
  return decode(db.prepare('SELECT * FROM rollout_items WHERE id=?').get(id));
}
