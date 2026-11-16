const assert = require('node:assert/strict');
const test = require('node:test');
const { createClient } = require('@libsql/client');

test('financial constraints protect money, webhook idempotency and invoice uniqueness', async () => {
  const c = createClient({ url: 'file::memory:' }); await c.execute('PRAGMA foreign_keys=ON');
  await c.batch(['CREATE TABLE plans(id TEXT PRIMARY KEY)','CREATE TABLE subs(id TEXT PRIMARY KEY, plan_id TEXT REFERENCES plans(id))','CREATE TABLE inv(id TEXT PRIMARY KEY, sub_id TEXT REFERENCES subs(id), amount INTEGER CHECK(amount>=0), ext TEXT UNIQUE)','CREATE TABLE hooks(id TEXT PRIMARY KEY, event TEXT UNIQUE)'],'write');
  await c.execute({sql:'INSERT INTO plans VALUES (?)',args:['p1']}); await c.execute({sql:'INSERT INTO subs VALUES (?,?)',args:['s1','p1']});
  await c.execute({sql:'INSERT INTO inv VALUES (?,?,?,?)',args:['i1','s1',4990,'ext-1']}); await assert.rejects(()=>c.execute({sql:'INSERT INTO inv VALUES (?,?,?,?)',args:['i2','s1',4990,'ext-1']})); await assert.rejects(()=>c.execute({sql:'INSERT INTO inv VALUES (?,?,?,?)',args:['i3','s1',-1,'ext-3']}));
  await c.execute({sql:'INSERT INTO hooks VALUES (?,?)',args:['h1','evt-1']}); await assert.rejects(()=>c.execute({sql:'INSERT INTO hooks VALUES (?,?)',args:['h2','evt-1']})); await c.close();
});
