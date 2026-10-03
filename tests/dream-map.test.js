const assert=require('assert'); const A=require('../js/analytics-core.js');
const E=[{id:'1',symbols:['Puerta'],places:['Hotel'],emotions:['Miedo'],tags:[]},{id:'2',symbols:['Puerta'],places:['Hotel'],emotions:['Curiosidad'],tags:[]},{id:'3',symbols:['Agua'],places:['Hotel'],emotions:['Miedo'],tags:[]}];
const g=A.dreamGraph(E,{maxNodes:10});
assert.equal(g.nodes.find(n=>n.id==='hotel').count,3); assert.equal(g.nodes.find(n=>n.id==='puerta').count,2); assert.equal(g.edges.find(e=>e.id==='hotel::puerta').count,2); assert.equal(g.dreamCount,3); console.log('PASS dream-map');
