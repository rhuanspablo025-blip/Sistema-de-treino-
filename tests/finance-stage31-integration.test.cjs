const test = require('node:test');
const assert = require('node:assert/strict');
const { createClient } = require('@libsql/client');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

test('stage 3.1 services, tenant isolation and finance access use local SQL', async (t) => {
  const dbFile = path.resolve('.stage31-test.db');
  process.env.TURSO_DATABASE_URL = `file:${dbFile}`;
  delete process.env.TURSO_AUTH_TOKEN;
  const service = await import(pathToFileURL(path.resolve('lib/finance-service-sql.mjs')));
  const repo = await import(pathToFileURL(path.resolve('lib/financial-repository.mjs')));
  const identity = await import(pathToFileURL(path.resolve('lib/identity-repository.mjs')));
  const access = await import(pathToFileURL(path.resolve('lib/finance-access-core.mjs')));
  await repo.ensureFinancialSchema();
  await identity.ensureIdentitySchema();
  const sql = createClient({ url: `file:${dbFile}` });
  await sql.execute('PRAGMA foreign_keys=ON');
  const stamp = Date.now();
  const a = `qa-a-${stamp}`, b = `qa-b-${stamp}`, userA = `user-a-${stamp}`, userB = `user-b-${stamp}`;
  const now = new Date().toISOString();
  await sql.batch([
    { sql:'INSERT INTO tenants(id,name,slug,created_at,updated_at) VALUES (?,?,?,?,?)', args:[a,'QA A',a,now,now] },
    { sql:'INSERT INTO tenants(id,name,slug,created_at,updated_at) VALUES (?,?,?,?,?)', args:[b,'QA B',b,now,now] },
    { sql:'INSERT INTO identity_users(id,tenant_id,name,username,password_hash,role,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)', args:[userA,a,'QA A','qa'+stamp,'x','admin',now,now] },
    { sql:'INSERT INTO identity_users(id,tenant_id,name,username,password_hash,role,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)', args:[userB,b,'QA B','qb'+stamp,'x','admin',now,now] },
  ],'write');
  const adminA={id:userA,role:'admin',tenantId:a};
  const adminB={id:userB,role:'admin',tenantId:b};
  const superAdmin={id:'root',role:'SUPER_ADMIN',username:'rhuanspablo025'};
  const noDoc=async()=>{throw new Error('DOCUMENT_STORE_CALLED')};
  const oldDb=global.getDatabase, oldMongo=global.getMongoClient;
  global.getDatabase=noDoc; global.getMongoClient=noDoc;
  t.after(async()=>{global.getDatabase=oldDb;global.getMongoClient=oldMongo;await sql.close();});

  const own=await service.createBlockSqlService({tenantId:a,userId:userA,level:'TOTAL',reason:'qa',source:'MANUAL',createdBy:userA});
  assert.equal(own.block.tenantId,a);
  assert.equal((await repo.listAccessBlocksSql(a)).length,1);
  await assert.rejects(service.createBlockSqlService({tenantId:b,userId:userB,level:'TOTAL',reason:'spoof',source:'MANUAL',createdBy:userA}));
  assert.equal((await repo.listAccessBlocksSql(b)).length,0);
  assert.equal((await service.listBlocks(adminA)).blocks.every(x=>x.tenantId===a),true);
  const stateA=await repo.getFinancialAccessSql({tenantId:a,userId:userA});
  const blocked=access.evaluateFinancialAccess({block:stateA,hasActiveSubscription:true});
  assert.equal(blocked.blocked,true);
  await service.releaseBlockSqlService({id:own.block.id,tenantId:a});
  const released=await access.getFinancialAccess({id:userA,role:'admin',tenantId:a});
  assert.notEqual(released.id,own.block.id);
  const historical=await repo.getAccessBlockSql(own.block.id,a);
  assert.equal(historical.status,'RELEASED'); assert.ok(historical.released_at);

  const blockB=await service.createBlockSqlService({tenantId:b,userId:userB,level:'TOTAL',reason:'qa-b',source:'MANUAL',createdBy:userB});
  await assert.rejects(service.releaseBlockSqlService({id:blockB.block.id,tenantId:a}));
  assert.equal((await repo.getAccessBlockSql(blockB.block.id,b)).status,'ACTIVE');
  assert.equal((await service.listBlocks(adminA)).blocks.some(x=>x.tenantId===b),false);

  const original=await service.getRulesSqlService('global');
  await service.updateRulesSqlService({tenantId:'global',graceDays:3,restrictAfterDays:5,blockAfterDays:8});
  assert.equal((await service.getRulesSqlService('global')).rules.grace_days,3);
  await service.updateRulesSqlService({tenantId:'global',graceDays:original.rules?.grace_days||0,restrictAfterDays:original.rules?.restrict_after_days||0,blockAfterDays:original.rules?.block_after_days||0});
  assert.equal(adminA.tenantId,a); assert.equal(adminB.tenantId,b); assert.equal(superAdmin.role,'SUPER_ADMIN');
});
