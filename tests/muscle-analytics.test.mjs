import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateMuscles } from '../lib/muscle-analytics.mjs';
const catalog = [{id:'a',name:'Supino',primaryMuscles:['Peito','Peito'],secondaryMuscles:['Tríceps','Peito']}];
test('planned workload counts total volume only once',()=>{
 const result=aggregateMuscles([{exerciseId:'a',sets:4,repetitions:'12',load:60}],catalog);
 assert.equal(result.totals.volume,2880);
 assert.equal(result.totals.sets,4);
 assert.equal(result.groups.find(g=>g.muscle==='peito').primarySets,4);
 assert.equal(result.groups.find(g=>g.muscle==='triceps').secondarySets,4);
});
test('unknown prescription volume is not invented',()=>{
 const result=aggregateMuscles([{exerciseId:'a',sets:3,repetitions:'8-12',load:null}],catalog);
 assert.equal(result.totals.unknownVolumeSets,3);
 assert.equal(result.totals.volume,0);
});
test('performed sets use actual repetitions and load',()=>{
 const result=aggregateMuscles([{exerciseId:'a',sets:[{repetitions:10,load:50},{repetitions:8,load:60}]}],catalog,{mode:'performed'});
 assert.equal(result.totals.volume,980);
 assert.equal(result.totals.sets,2);
});
test('missing catalog is explicitly counted',()=>{
 const result=aggregateMuscles([{exerciseId:'missing',sets:2,repetitions:'10',load:20}],[]);
 assert.equal(result.totals.unclassifiedSets,2);
 assert.equal(result.groups.length,0);
});
