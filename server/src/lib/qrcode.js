// Pure JavaScript QR Code Generator (SVG output)
// Supports Byte mode (8-bit), Error Correction Level M/L, Versions 1-10.
// Zero external dependencies.

const PAD0 = 0xec;
const PAD1 = 0x11;

// GF(256) log and exp tables for Reed-Solomon error correction
const EXP_TABLE = new Uint8Array(256);
const LOG_TABLE = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP_TABLE[i] = x;
  LOG_TABLE[x] = i;
  x <<= 1;
  if (x & 256) x ^= 0x11d;
}
EXP_TABLE[255] = EXP_TABLE[0];

function glog(n) {
  if (n < 1) throw new Error('glog(0) undefined');
  return LOG_TABLE[n];
}

function gexp(n) {
  while (n < 0) n += 255;
  while (n >= 255) n -= 255;
  return EXP_TABLE[n];
}

function gmult(x, y) {
  if (x === 0 || y === 0) return 0;
  return gexp(glog(x) + glog(y));
}

// Polynomial operations
function polyMultiply(p1, p2) {
  const result = new Uint8Array(p1.length + p2.length - 1);
  for (let i = 0; i < p1.length; i++) {
    for (let j = 0; j < p2.length; j++) {
      result[i + j] ^= gmult(p1[i], p2[j]);
    }
  }
  return result;
}

function rsGeneratorPoly(degree) {
  let g = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    g = polyMultiply(g, new Uint8Array([1, gexp(i)]));
  }
  return g;
}

function rsCompute(data, eccLength) {
  const gen = rsGeneratorPoly(eccLength);
  const remainder = new Uint8Array(eccLength);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ remainder[0];
    remainder.copyWithin(0, 1);
    remainder[eccLength - 1] = 0;
    for (let j = 0; j < eccLength; j++) {
      remainder[j] ^= gmult(gen[j + 1], factor);
    }
  }
  return remainder;
}

// Capacity table: [Version, TotalDataBytes(M), EccBytesPerBlock, NumBlocks]
// For TOTP URI (~100-130 chars), Version 5 to 7 M easily covers it.
const VERSION_TABLE = [
  null,
  { version: 1, size: 21, dataBytes: 16, eccBytes: 10, blocks: 1 },
  { version: 2, size: 25, dataBytes: 28, eccBytes: 16, blocks: 1 },
  { version: 3, size: 29, dataBytes: 44, eccBytes: 26, blocks: 1 },
  { version: 4, size: 33, dataBytes: 64, eccBytes: 18, blocks: 2 },
  { version: 5, size: 37, dataBytes: 86, eccBytes: 24, blocks: 2 },
  { version: 6, size: 41, dataBytes: 108, eccBytes: 16, blocks: 4 },
  { version: 7, size: 45, dataBytes: 124, eccBytes: 18, blocks: 4 },
  { version: 8, size: 49, dataBytes: 154, eccBytes: 22, blocks: 4 },
  { version: 9, size: 53, dataBytes: 182, eccBytes: 22, blocks: 5 },
  { version: 10, size: 57, dataBytes: 216, eccBytes: 26, blocks: 5 },
];

const ALIGN_PATTERNS = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

// Bit buffer helper
class BitBuffer {
  constructor() {
    this.buffer = [];
    this.length = 0;
  }
  put(num, length) {
    for (let i = 0; i < length; i++) {
      this.putBit(((num >>> (length - i - 1)) & 1) === 1);
    }
  }
  putBit(bit) {
    const bufIndex = Math.floor(this.length / 8);
    if (this.buffer.length <= bufIndex) {
      this.buffer.push(0);
    }
    if (bit) {
      this.buffer[bufIndex] |= (0x80 >>> (this.length % 8));
    }
    this.length++;
  }
}

/**
 * Creates QR Matrix
 */
export function createQrMatrix(text) {
  const textBytes = Buffer.from(text, 'utf8');

  // Find lowest version that fits
  let versionInfo = null;
  for (let v = 1; v <= 10; v++) {
    const info = VERSION_TABLE[v];
    // Byte mode overhead: 4 bits mode + 8 bits (or 16 bits) length
    const overhead = (v <= 9 ? 8 : 16) + 4;
    const requiredBytes = Math.ceil((overhead + textBytes.length * 8) / 8);
    if (requiredBytes <= info.dataBytes) {
      versionInfo = info;
      break;
    }
  }

  if (!versionInfo) {
    versionInfo = VERSION_TABLE[10];
  }

  const { version, size, dataBytes, eccBytes, blocks } = versionInfo;

  // 1. Encode data bits
  const bb = new BitBuffer();
  bb.put(0x4, 4); // Byte mode indicator
  bb.put(textBytes.length, version <= 9 ? 8 : 16); // Character count
  for (let i = 0; i < textBytes.length; i++) {
    bb.put(textBytes[i], 8);
  }

  // Terminator (up to 4 zero bits)
  const remainingBits = dataBytes * 8 - bb.length;
  bb.put(0, Math.min(4, Math.max(0, remainingBits)));

  // Byte align
  while (bb.length % 8 !== 0) {
    bb.putBit(false);
  }

  // Pad bytes
  let padToggle = false;
  while (bb.length < dataBytes * 8) {
    bb.put(padToggle ? PAD1 : PAD0, 8);
    padToggle = !padToggle;
  }

  const rawBytes = new Uint8Array(bb.buffer);

  // 2. Compute Reed-Solomon Error Correction per block
  const blockSize = Math.floor(dataBytes / blocks);
  const extraBytes = dataBytes % blocks;
  const dataBlocks = [];
  const eccBlocks = [];

  let offset = 0;
  for (let b = 0; b < blocks; b++) {
    const curSize = blockSize + (b >= blocks - extraBytes ? 1 : 0);
    const blockData = rawBytes.slice(offset, offset + curSize);
    offset += curSize;
    dataBlocks.push(blockData);
    eccBlocks.push(rsCompute(blockData, eccBytes));
  }

  // Interleave data and ECC bytes
  const finalCodewords = [];
  const maxDataLen = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxDataLen; i++) {
    for (let b = 0; b < blocks; b++) {
      if (i < dataBlocks[b].length) {
        finalCodewords.push(dataBlocks[b][i]);
      }
    }
  }
  for (let i = 0; i < eccBytes; i++) {
    for (let b = 0; b < blocks; b++) {
      finalCodewords.push(eccBlocks[b][i]);
    }
  }

  // 3. Construct Matrix
  const matrix = Array.from({ length: size }, () => new Int8Array(size).fill(-1));
  const reserved = Array.from({ length: size }, () => new Uint8Array(size));

  function setModule(r, c, val) {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      matrix[r][c] = val ? 1 : 0;
      reserved[r][c] = 1;
    }
  }

  // Finder pattern helper
  function placeFinder(row, col) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = row + r;
        const nc = col + c;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        const isBlack =
          (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
          (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        setModule(nr, nc, isBlack ? 1 : 0);
      }
    }
  }

  // Place 3 Finder Patterns
  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    const val = i % 2 === 0 ? 1 : 0;
    if (!reserved[6][i]) setModule(6, i, val);
    if (!reserved[i][6]) setModule(i, 6, val);
  }

  // Dark module
  setModule(4 * version + 9, 8, 1);

  // Alignment patterns
  const positions = ALIGN_PATTERNS[version] || [];
  for (let i = 0; i < positions.length; i++) {
    for (let j = 0; j < positions.length; j++) {
      const ar = positions[i];
      const ac = positions[j];
      if (reserved[ar][ac]) continue;
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const isEdge = Math.abs(r) === 2 || Math.abs(c) === 2;
          const isCenter = r === 0 && c === 0;
          setModule(ar + r, ac + c, isEdge || isCenter ? 1 : 0);
        }
      }
    }
  }

  // Reserve format info area
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      reserved[8][i] = 1;
      reserved[i][8] = 1;
    }
  }
  for (let i = size - 8; i < size; i++) {
    reserved[8][i] = 1;
    reserved[i][8] = 1;
  }

  // 4. Place Codewords in zig-zag
  let bitIndex = 0;
  let dir = -1; // up
  let row = size - 1;
  let col = size - 1;

  while (col > 0) {
    if (col === 6) col--; // Skip vertical timing pattern

    while (row >= 0 && row < size) {
      for (let c = 0; c < 2; c++) {
        const curCol = col - c;
        if (!reserved[row][curCol]) {
          let bit = 0;
          const byteIdx = Math.floor(bitIndex / 8);
          if (byteIdx < finalCodewords.length) {
            bit = (finalCodewords[byteIdx] >>> (7 - (bitIndex % 8))) & 1;
          }
          matrix[row][curCol] = bit;
          bitIndex++;
        }
      }
      row += dir;
    }
    dir = -dir;
    row += dir;
    col -= 2;
  }

  // 5. Apply Mask 0: (row + col) % 2 === 0
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!reserved[r][c]) {
        if ((r + c) % 2 === 0) {
          matrix[r][c] ^= 1;
        }
      }
    }
  }

  // 6. Format info for Mask 0 and ECL M (Format bits: 101010000010010)
  const FORMAT_BITS = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];
  // Top-left format bits
  const tlCoords = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
  ];
  for (let i = 0; i < 15; i++) {
    const [r, c] = tlCoords[i];
    matrix[r][c] = FORMAT_BITS[i];
  }
  // Bottom-left and top-right format bits
  for (let i = 0; i < 7; i++) {
    matrix[size - 1 - i][8] = FORMAT_BITS[i];
  }
  for (let i = 7; i < 15; i++) {
    matrix[8][size - 15 + i] = FORMAT_BITS[i];
  }

  return matrix;
}

/**
 * Generates an SVG string representation of the QR Code
 */
export function generateQrSvg(text, { size = 200, margin = 2 } = {}) {
  const matrix = createQrMatrix(text);
  const matrixSize = matrix.length;
  const totalModules = matrixSize + margin * 2;
  const cellSize = size / totalModules;

  let paths = '';
  for (let r = 0; r < matrixSize; r++) {
    for (let c = 0; c < matrixSize; c++) {
      if (matrix[r][c] === 1) {
        const x = (c + margin) * cellSize;
        const y = (r + margin) * cellSize;
        paths += `M${x.toFixed(2)},${y.toFixed(2)}h${cellSize.toFixed(2)}v${cellSize.toFixed(2)}h-${cellSize.toFixed(2)}z `;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges">
  <rect width="100%" height="100%" fill="#ffffff" rx="8" ry="8"/>
  <path d="${paths}" fill="#0f172a"/>
</svg>`;
}
