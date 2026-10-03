const assert=require('assert');
require('../js/audio-engine.js');

const meta=global.ONEIRO_AUDIO_META;
assert.ok(meta);
assert.deepStrictEqual(meta.LAYERS,['rain','wind','pink','brown','drone']);

const defaults=meta.deepPrefs({});
assert.strictEqual(defaults.enabled,true);
assert.strictEqual(defaults.master,34);
assert.strictEqual(defaults.layers.rain,100);

const clamped=meta.deepPrefs({master:999,fadeSeconds:0,layers:{rain:-5,drone:500}});
assert.strictEqual(clamped.master,70);
assert.strictEqual(clamped.fadeSeconds,.2);
assert.strictEqual(clamped.layers.rain,0);
assert.strictEqual(clamped.layers.drone,100);

const liminal=meta.presetMix('Liminal','DESCENT',40,defaults);
const lucid=meta.presetMix('Lucid','DESCENT',40,defaults);
assert.ok(liminal.layers.wind>lucid.layers.wind);
assert.ok(liminal.layers.drone>0);
assert.ok(liminal.master<=.5);
Object.values(liminal.layers).forEach(v=>assert.ok(v>=0&&v<=.24));

const sleep=meta.presetMix('Dream','SLEEP',100,defaults);
const descent=meta.presetMix('Dream','DESCENT',100,defaults);
assert.ok(sleep.master<descent.master);

const muted=meta.presetMix('Dream','DESCENT',40,{...defaults,layers:{...defaults.layers,rain:0}});
assert.strictEqual(muted.layers.rain,0);

console.log('PASS audio-engine: prefs, safety clamps, presets, phase scaling and layer mixer');
