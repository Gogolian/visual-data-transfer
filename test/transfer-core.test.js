const assert = require('assert/strict');
const test = require('node:test');
const {
  GRID_SIZE,
  COLORS,
  drawMetadata,
  readMetadata,
  readDataCells,
  getColorIndexForBits,
  textToBinary,
  binaryToText,
  chunkBinaryData
} = require('../transfer-core');

function hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16)
  };
}

function createContext(width = 800, height = 600) {
  const pixels = new Map();

  return {
    canvas: { width, height },
    fillStyle: '#000000',
    fillRect(x, y, width, height) {
      const rgb = hexToRgb(this.fillStyle);
      const startCol = Math.floor(x / GRID_SIZE);
      const endCol = Math.ceil((x + width) / GRID_SIZE);
      const startRow = Math.floor(y / GRID_SIZE);
      const endRow = Math.ceil((y + height) / GRID_SIZE);

      for (let row = startRow; row < endRow; row++) {
        for (let col = startCol; col < endCol; col++) {
          pixels.set(`${col},${row}`, rgb);
        }
      }
    },
    getImageData(x, y) {
      const col = Math.floor(x / GRID_SIZE);
      const row = Math.floor(y / GRID_SIZE);
      const rgb = pixels.get(`${col},${row}`) || hexToRgb('#000000');
      return { data: [rgb.r, rgb.g, rgb.b, 255] };
    }
  };
}

test('text and binary conversion round-trips JSON-safe text', () => {
  const text = JSON.stringify({ name: 'demo', value: '✓' });
  assert.equal(binaryToText(textToBinary(text)), text);
});

test('binary data is chunked without padding', () => {
  assert.deepEqual(chunkBinaryData('1010101', 3), ['101', '010', '1']);
});

test('metadata includes chunk length and data reader trims trailing cells', () => {
  const ctx = createContext();
  const chunk = '10101';

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  drawMetadata(ctx, 2, 4, chunk.length);

  for (let i = 0; i < chunk.length; i += 3) {
    const bits = chunk.slice(i, i + 3);
    const colorIndex = getColorIndexForBits(bits);
    const cellIndex = Math.floor(i / 3);
    ctx.fillStyle = COLORS[colorIndex];
    ctx.fillRect(cellIndex * GRID_SIZE, GRID_SIZE, GRID_SIZE, GRID_SIZE);
  }

  assert.deepEqual(readMetadata(ctx), {
    chunkIndex: 2,
    totalChunks: 4,
    chunkBitLength: 5
  });
  assert.equal(readDataCells(ctx, chunk.length), chunk);
});
