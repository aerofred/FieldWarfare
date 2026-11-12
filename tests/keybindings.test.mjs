import test from 'node:test';
import assert from 'node:assert/strict';
import {ACTIONS,actionMap,bind,bindingText,defaultBindings,keyName,normalizeBindings} from '../src/keybindings.js';

test('defaults: one action per key, X fires, E aims, arrows move and turn', () => {
  const b = defaultBindings(), map = actionMap(b);
  assert.equal(map.get('KeyX'), 'fire');
  assert.equal(map.get('KeyE'), 'aim');
  assert.equal(map.get('ArrowUp'), 'forward');
  assert.equal(map.get('ArrowLeft'), 'turnLeft');
  assert.equal(map.get('Digit1'), 'primary');
  assert.equal(map.size, ACTIONS.reduce((n, a) => n + a.keys.length, 0));
});

test('saved bindings are cleaned', () => {
  const b = normalizeBindings({fire: ['KeyF', 'KeyF', 'Escape', 'MetaLeft', 42, 'KeyJ', 'KeyK'], aim: ['KeyF'], bogus: ['KeyQ']});
  assert.deepEqual(b.fire, ['KeyF', 'KeyJ']);
  assert.deepEqual(b.aim, [], 'a key claimed twice stays with the first action');
  assert.deepEqual(b.reload, ['KeyR'], 'missing actions keep their default');
  assert.equal(b.bogus, undefined);
  assert.deepEqual(normalizeBindings(null), defaultBindings());
  assert.deepEqual(normalizeBindings('junk'), defaultBindings());
});

test('binding a key takes it from another action', () => {
  const b = defaultBindings();
  assert.equal(bind(b, 'fire', 0, 'KeyR'), 'reload');
  assert.deepEqual(b.fire, ['KeyR']);
  assert.deepEqual(b.reload, []);
  assert.equal(bind(b, 'fire', 1, 'Space'), 'jump');
  assert.deepEqual(b.fire, ['KeyR', 'Space']);
  assert.equal(bind(b, 'fire', 1, 'KeyX'), null, 'replaces the second slot');
  assert.deepEqual(b.fire, ['KeyR', 'KeyX']);
});

test('second slots, swaps and clearing', () => {
  const b = defaultBindings();
  bind(b, 'forward', 0, 'ArrowUp');
  assert.deepEqual(b.forward, ['ArrowUp', 'KeyW'], 'a key already on the other slot swaps');
  bind(b, 'aim', 1, 'KeyE');
  assert.deepEqual(b.aim, ['KeyE'], 'no duplicate inside one action');
  bind(b, 'forward', 0, null);
  assert.deepEqual(b.forward, ['KeyW']);
  bind(b, 'forward', 0, null);
  assert.deepEqual(b.forward, []);
  assert.equal(bindingText(b, 'forward'), '—');
  bind(b, 'forward', 1, 'KeyI');
  assert.deepEqual(b.forward, ['KeyI'], 'an empty first slot is filled first');
});

test('key names', () => {
  assert.equal(keyName('Space'), 'SPACE');
  assert.equal(keyName('ArrowLeft'), '←');
  assert.equal(keyName('Digit2'), '2');
  assert.equal(keyName('Numpad5'), 'NUMPAD 5');
  assert.equal(keyName('KeyR'), 'R');
  assert.equal(keyName('F4'), 'F4');
  assert.equal(bindingText({aim: ['KeyE', 'Space']}, 'aim'), 'E OR SPACE');
});
