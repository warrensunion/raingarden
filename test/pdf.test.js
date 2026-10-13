/**
 * PDF writer tests: structure, byte-exact xref, escaping.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { makePdf } from '../src/plan/pdf.js';

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9, 0x0a, 0x28, 0x29]);
const dec = (u) => new TextDecoder('latin1').decode(u);

test('pdf starts with %PDF-1.4, has a valid xref and ends with %%EOF', () => {
  const pdf = makePdf({
    jpeg, imgW: 400, imgH: 300, title: 'Plan',
    lines: ['Hello (world) \\ ok', 'Zoë é ☃'],
  });
  const s = dec(pdf);
  assert.ok(s.startsWith('%PDF-1.4'));
  assert.ok(s.trimEnd().endsWith('%%EOF'));
  const sx = Number(/startxref\n(\d+)\n%%EOF/.exec(s)[1]);
  assert.equal(s.slice(sx, sx + 4), 'xref');
  const m = /xref\n0 (\d+)\n((?:\d{10} \d{5} [nf] \n)+)/.exec(s);
  const n = Number(m[1]);
  const rows = m[2].split('\n').filter(Boolean);
  assert.equal(rows.length, n);
  assert.equal(rows[0], '0000000000 65535 f ');
  for (let i = 1; i < n; i++) {
    const off = Number(rows[i].slice(0, 10));
    assert.ok(s.slice(off).startsWith(`${i} 0 obj`), `obj ${i}`);
  }
  assert.match(s, /\/Title \(Plan\)/);
  assert.match(s, /\/Filter \/DCTDecode/);
  assert.match(s, /\/BaseFont \/Helvetica/);
  assert.ok(s.includes('(Hello \\(world\\) \\\\ ok) Tj'));
  assert.ok(s.includes('(Zoë é ?) Tj'));
});

test('jpeg bytes embedded as-is with matching /Length', () => {
  const s = dec(makePdf({ jpeg, imgW: 4, imgH: 3, title: 'T', lines: [] }));
  assert.ok(s.includes('/Length 7 >>\nstream\n' + dec(jpeg) + '\nendstream'));
});

test('text that does not fit is dropped, not overflowed', () => {
  const lines = Array.from({ length: 500 }, (_, i) => 'line ' + i);
  const s = dec(makePdf({ jpeg, imgW: 100, imgH: 100, title: 'T', lines }));
  assert.ok(s.includes('(line 0) Tj'));
  assert.ok(!s.includes('(line 499) Tj'));
});
