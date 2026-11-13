import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDb } from '../services/api/db.mjs';
import { list, update } from '../services/api/rollout.mjs';

test('rollout seeds exactly thirteen tentative, unverified items and preserves updates', () => {
  const db=openDb(':memory:');
  const items=list(db);
  assert.equal(items.length,13);
  assert.ok(items.every(x=>x.status==='unverified'&&x.maturity==='tentative'));
  const out=update(db,'VV-GFX-01',{title:'Graphics validation',owner:'QA',status:'in_progress'});
  assert.equal(out.owner,'QA');
  assert.equal(list(db)[0].title,'Graphics validation');
  assert.throws(()=>update(db,'VV-GFX-01',{status:'complete'}),/evidence/i);
  assert.throws(()=>update(db,'VV-GFX-01',{evidence_url:'javascript:alert(1)'}),/HTTPS/i);
  assert.throws(()=>update(db,'VV-GFX-01',{dependencies:['VV-GFX-01']}),/Circular/i);
  update(db,'VV-GFX-01',{dependencies:['VV-GFX-02']});
  assert.throws(()=>update(db,'VV-GFX-02',{dependencies:['VV-GFX-01']}),/Circular/i);
  const done=update(db,'VV-GFX-03',{status:'complete',test_result:'Passed',evidence_url:'https://example.org/evidence'});
  assert.equal(done.status,'complete');
  db.close();
});
