import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('login candidate accepts login name or email within tenant',()=>{
  const store=fs.readFileSync(new URL('../api/shared/auth-store.js',import.meta.url),'utf8');
  assert.match(store,/where u\.tenant_id=\$1\s+and \(a\.login_name=\$2 or lower\(u\.email\)=\$2\)/i);
});
