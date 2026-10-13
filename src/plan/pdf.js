/**
 * Tiny dependency-free single-page PDF writer.
 *
 * WHY: the one-page plan export must work offline in the browser without
 * shipping a PDF library (Global Constraints: runtime deps are only three and
 * onnxruntime-web). A plan is one photo-based JPEG plus a few lines of text, so
 * PDF 1.4 with a DCT image XObject and Helvetica is all that is needed; the
 * JPEG bytes are embedded untouched (no re-encode, no canvas round trip).
 * Pure module: bytes in, bytes out.
 */

const enc = new TextEncoder();

/** Escape a string as the body of a PDF literal string, as WinAnsi/Latin-1 bytes. */
function pdfString(s) {
  const out = [];
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (ch === '(' || ch === ')' || ch === '\\') out.push(0x5c, c);
    else if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff)) out.push(c);
    else out.push(0x3f); // not representable in WinAnsi -> '?'
  }
  return Uint8Array.from(out);
}

const num = (n) => String(Math.round(n * 1000) / 1000);

/**
 * @param {{jpeg: Uint8Array, imgW: number, imgH: number, pageW?: number, pageH?: number, title: string, lines: string[]}} o
 * @returns {Uint8Array}
 */
export function makePdf({ jpeg, imgW, imgH, pageW = 595.28, pageH = 841.89, title, lines }) {
  // Image scaled to full page width, but never taller than 70% of the page.
  let drawW = pageW;
  let drawH = (pageW * imgH) / imgW;
  const maxH = pageH * 0.7;
  if (drawH > maxH) { drawH = maxH; drawW = (maxH * imgW) / imgH; }
  const imgX = (pageW - drawW) / 2;
  const imgY = pageH - drawH;

  // Content stream: image, then text lines while there is room.
  const margin = 36;
  const size = 9;
  const leading = 12;
  const parts = [enc.encode(`q ${num(drawW)} 0 0 ${num(drawH)} ${num(imgX)} ${num(imgY)} cm /Im0 Do Q\n`)];
  let y = imgY - 20;
  const textParts = [];
  for (const line of lines) {
    if (y < margin) break;
    textParts.push(enc.encode(`1 0 0 1 ${margin} ${num(y)} Tm (`), pdfString(line), enc.encode(') Tj\n'));
    y -= leading;
  }
  if (textParts.length) {
    parts.push(enc.encode(`BT /F1 ${size} Tf ${leading} TL\n`), ...textParts, enc.encode('ET\n'));
  }
  const content = concat(parts);

  const objs = []; // index 0 -> object 1; each an array of Uint8Array chunks
  objs.push([enc.encode('<< /Type /Catalog /Pages 2 0 R >>')]);
  objs.push([enc.encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')]);
  objs.push([enc.encode(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(pageW)} ${num(pageH)}] ` +
    '/Resources << /XObject << /Im0 4 0 R >> /Font << /F1 6 0 R >> >> /Contents 5 0 R >>')]);
  objs.push([
    enc.encode(`<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB ` +
      `/BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),
    jpeg,
    enc.encode('\nendstream'),
  ]);
  objs.push([enc.encode(`<< /Length ${content.length} >>\nstream\n`), content, enc.encode('\nendstream')]);
  objs.push([enc.encode('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')]);
  objs.push([enc.encode('<< /Title ('), pdfString(title), enc.encode(') /Producer (Raingarden) >>')]);

  // Header plus a comment of high bytes so tools treat the file as binary.
  const out = [Uint8Array.from([...enc.encode('%PDF-1.4\n%'), 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])];
  let offset = out[0].length;
  const offsets = [];
  objs.forEach((chunks, i) => {
    offsets.push(offset);
    const head = enc.encode(`${i + 1} 0 obj\n`);
    const tail = enc.encode('\nendobj\n');
    for (const c of [head, ...chunks, tail]) { out.push(c); offset += c.length; }
  });
  const xrefPos = offset;
  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) xref += `${String(o).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  out.push(enc.encode(xref));
  return concat(out);
}

function concat(chunks) {
  let n = 0;
  for (const c of chunks) n += c.length;
  const r = new Uint8Array(n);
  let p = 0;
  for (const c of chunks) { r.set(c, p); p += c.length; }
  return r;
}
