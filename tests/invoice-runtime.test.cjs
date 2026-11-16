const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('lib/finance-service.js', 'utf8');
for (const name of ['createInvoice', 'getInvoices', 'updateInvoice']) {
  test(`invoice runtime ${name} is SQL-only`, () => {
    const start = source.indexOf(`export async function ${name}`);
    const end = source.indexOf('\n}', start) + 2;
    assert.ok(start >= 0);
    assert.equal(source.slice(start, end).includes('.collection('), false);
  });
}
