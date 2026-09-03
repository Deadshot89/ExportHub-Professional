import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('login name has priority and email login must be unique within tenant',()=>{
  const store=fs.readFileSync(new URL('../api/shared/auth-store.js',import.meta.url),'utf8');
  assert.match(store,/a\.login_name as login_name/i);
  assert.match(store,/where u\.tenant_id=\$1\s+and \(a\.login_name=\$2 or lower\(u\.email\)=\$2\)/i);
  assert.match(store,/order by \(a\.login_name=\$2\) desc/i);
  assert.match(store,/limit 2/i);
  assert.match(store,/if\(r\.rows\[0\]\?\.login_name===key\) return r\.rows\[0\]/i);
  assert.match(store,/if\(r\.rows\.length===1\) return r\.rows\[0\]/i);
});
