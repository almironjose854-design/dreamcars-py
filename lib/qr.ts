// Standard ISO/IEC 18004 QR Code (Error Correction Level L, Byte Mode, Versions 1..6)
const CAPACITIES = [0, 17, 32, 53, 78, 106, 134];
const EC_CODEWORDS = [0, 7, 10, 15, 20, 26, 18]; // Note: v6-L has 2 blocks of 18 EC codewords
const TOTAL_DATA = [0, 19, 34, 55, 80, 108, 136];
const ALIGNMENT = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34]];

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a: number, b: number) {
  return a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const root = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data: Uint8Array, ecLen: number): Uint8Array {
  const gen = rsGeneratorPoly(ecLen);
  const rem = new Uint8Array(ecLen);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    rem.copyWithin(0, 1);
    rem[ecLen - 1] = 0;
    for (let j = 0; j < ecLen; j++) {
      rem[j] ^= gfMul(gen[j + 1], factor);
    }
  }
  return rem;
}

export function generateQrMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  let version = 1;
  while (version < 6 && bytes.length > CAPACITIES[version]) version++;
  const payload = bytes.slice(0, CAPACITIES[version]);

  const totalDataBytes = TOTAL_DATA[version];
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };

  pushBits(0b0100, 4); // Byte mode
  pushBits(payload.length, 8);
  for (const b of payload) pushBits(b, 8);
  pushBits(0, Math.min(4, totalDataBytes * 8 - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const dataWords = new Uint8Array(totalDataBytes);
  for (let i = 0; i < bits.length / 8; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) byte = (byte << 1) | bits[i * 8 + b];
    dataWords[i] = byte;
  }
  const pads = [0xec, 0x11];
  for (let i = bits.length / 8, p = 0; i < totalDataBytes; i++, p ^= 1) {
    dataWords[i] = pads[p];
  }

  let finalCodewords: number[] = [];
  if (version < 6) {
    const ec = rsEncode(dataWords, EC_CODEWORDS[version]);
    finalCodewords = [...dataWords, ...ec];
  } else {
    const b1 = dataWords.slice(0, 68);
    const b2 = dataWords.slice(68, 136);
    const ec1 = rsEncode(b1, 18);
    const ec2 = rsEncode(b2, 18);
    for (let i = 0; i < 68; i++) finalCodewords.push(b1[i], b2[i]);
    for (let i = 0; i < 18; i++) finalCodewords.push(ec1[i], ec2[i]);
  }

  const size = 17 + version * 4;
  const modules: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const isFunction: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const setFunction = (r: number, c: number, dark: boolean) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      modules[r][c] = dark;
      isFunction[r][c] = true;
    }
  };

  const drawFinder = (r: number, c: number) => {
    for (let dy = -1; dy <= 7; dy++) {
      for (let dx = -1; dx <= 7; dx++) {
        const inOuter = dy >= 0 && dy <= 6 && dx >= 0 && dx <= 6;
        const inRing = dy === 0 || dy === 6 || dx === 0 || dx === 6;
        const inCenter = dy >= 2 && dy <= 4 && dx >= 2 && dx <= 4;
        setFunction(r + dy, c + dx, inOuter && (inRing || inCenter));
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  for (let i = 8; i < size - 8; i++) {
    setFunction(6, i, i % 2 === 0);
    setFunction(i, 6, i % 2 === 0);
  }

  const align = ALIGNMENT[version];
  if (align.length > 0) {
    for (const r of align) {
      for (const c of align) {
        if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            setFunction(r + dy, c + dx, Math.max(Math.abs( dx), Math.abs(dy)) !== 1);
          }
        }
      }
    }
  }

  // Reserve format info areas
  for (let i = 0; i <= 8; i++) {
    if (!isFunction[8][i]) setFunction(8, i, false);
    if (!isFunction[i][8]) setFunction(i, 8, false);
    if (i < 8) {
      setFunction(8, size - 1 - i, false);
      setFunction(size - 1 - i, 8, false);
    }
  }
  setFunction(size - 8, 8, true); // Dark module

  // Place data bits
  const allBits: number[] = [];
  for (const cw of finalCodewords) {
    for (let b = 7; b >= 0; b--) allBits.push((cw >> b) & 1);
  }

  let bitIdx = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      const r = upward ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        if (!isFunction[r][c]) {
          const dark = bitIdx < allBits.length ? allBits[bitIdx++] === 1 : false;
          // Mask 0: (r + c) % 2 === 0
          modules[r][c] = dark !== ((r + c) % 2 === 0);
        }
      }
    }
    upward = !upward;
  }

  // Format bits for Level L (01) and Mask 0 (000) -> precomputed BCH & XOR mask: 0x77c4
  const formatBits = 0x77c4;
  for (let i = 0; i <= 5; i++) modules[8][i] = ((formatBits >> i) & 1) === 1;
  modules[8][7] = ((formatBits >> 6) & 1) === 1;
  modules[8][8] = ((formatBits >> 7) & 1) === 1;
  modules[7][8] = ((formatBits >> 8) & 1) === 1;
  for (let i = 9; i < 15; i++) modules[14 - i][8] = ((formatBits >> i) & 1) === 1;

  for (let i = 0; i < 8; i++) modules[8][size - 1 - i] = ((formatBits >> i) & 1) === 1;
  for (let i = 8; i < 15; i++) modules[size - 15 + i][8] = ((formatBits >> i) & 1) === 1;

  return modules;
}
