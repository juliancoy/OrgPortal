import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Standalone operator script has no declaration file.
import { changesFor } from '../scripts/enrich-venues.mjs';

test('venue enrichment preserves intervening edits and safely resumes partially saved records', () => {
  const record = { id: 'hall', before: { website: null, address: 'Old address' },
    patch: { website: 'https://hall.example', address: 'Verified address' } };
  assert.deepEqual(changesFor(record, { id: 'hall', website: null, address: 'Old address' }), record.patch);
  assert.deepEqual(changesFor(record, { id: 'hall', website: 'https://hall.example', address: 'Old address' }), { address: 'Verified address' });
  assert.deepEqual(changesFor(record, { id: 'hall', ...record.patch }), {});
  assert.throws(() => changesFor(record, { id: 'hall', website: null, address: 'New organizer edit' }), /changed since research/);
  assert.throws(() => changesFor(record, null), /Missing venue/);
});
