(function attachVisualTransferCore(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VisualTransferCore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function createVisualTransferCore() {
  const GRID_SIZE = 10;
  const COLORS = [
    '#FF0000',
    '#00FF00',
    '#0000FF',
    '#FFFF00',
    '#FF00FF',
    '#00FFFF',
    '#FFFFFF',
    '#000000'
  ];
  const CHUNK_INDEX_BITS = 16;
  const TOTAL_CHUNKS_BITS = 16;
  const CHUNK_LENGTH_BITS = 32;
  const CHECKSUM_START_CELL = 64;
  const COLOR_BIT_WIDTH = 3;

  const RGB_COLORS = COLORS.map(hexToRgb);

  function getCanvasMetrics(canvas) {
    const cols = Math.floor(canvas.width / GRID_SIZE);
    const rows = Math.floor(canvas.height / GRID_SIZE);
    return { cols, rows };
  }

  function getMaxBitsPerFrame(canvas) {
    const { cols, rows } = getCanvasMetrics(canvas);
    return Math.max(0, cols * Math.max(0, rows - 1) * COLOR_BIT_WIDTH);
  }

  function assertHeaderCapacity(canvas) {
    const { cols } = getCanvasMetrics(canvas);
    if (cols < CHECKSUM_START_CELL + 2) {
      throw new Error('Canvas is too narrow to encode transfer metadata.');
    }
  }

  function drawBitCells(ctx, bits, offsetCell) {
    for (let i = 0; i < bits.length; i++) {
      ctx.fillStyle = bits[i] === '1' ? '#FFFFFF' : '#000000';
      ctx.fillRect((offsetCell + i) * GRID_SIZE, 0, GRID_SIZE, GRID_SIZE);
    }
  }

  function drawMetadata(ctx, chunkIndex, totalChunks, chunkBitLength) {
    assertHeaderCapacity(ctx.canvas);

    if (!Number.isSafeInteger(chunkIndex) || chunkIndex < 0 || chunkIndex > 0xffff) {
      throw new Error('Invalid chunk index.');
    }
    if (!Number.isSafeInteger(totalChunks) || totalChunks < 1 || totalChunks > 0xffff) {
      throw new Error('Invalid total chunk count.');
    }
    if (!Number.isSafeInteger(chunkBitLength) || chunkBitLength < 0 || chunkBitLength > 0xffffffff) {
      throw new Error('Invalid chunk bit length.');
    }

    const { cols } = getCanvasMetrics(ctx.canvas);
    drawBitCells(ctx, chunkIndex.toString(2).padStart(CHUNK_INDEX_BITS, '0'), 0);
    drawBitCells(ctx, totalChunks.toString(2).padStart(TOTAL_CHUNKS_BITS, '0'), 16);
    drawBitCells(ctx, chunkBitLength.toString(2).padStart(CHUNK_LENGTH_BITS, '0'), 32);

    for (let i = CHECKSUM_START_CELL; i < cols; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#FF0000' : '#00FF00';
      ctx.fillRect(i * GRID_SIZE, 0, GRID_SIZE, GRID_SIZE);
    }
  }

  function readBitCells(ctx, offsetCell, bitCount) {
    let bits = '';

    for (let i = 0; i < bitCount; i++) {
      const x = (offsetCell + i) * GRID_SIZE + Math.floor(GRID_SIZE / 2);
      const pixel = ctx.getImageData(x, Math.floor(GRID_SIZE / 2), 1, 1).data;
      const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
      bits += brightness > 128 ? '1' : '0';
    }

    return bits;
  }

  function readMetadata(ctx) {
    const { cols } = getCanvasMetrics(ctx.canvas);
    if (cols < CHECKSUM_START_CELL + 2) {
      return null;
    }

    for (let i = CHECKSUM_START_CELL; i < Math.min(cols, CHECKSUM_START_CELL + 8); i++) {
      const x = i * GRID_SIZE + Math.floor(GRID_SIZE / 2);
      const pixel = ctx.getImageData(x, Math.floor(GRID_SIZE / 2), 1, 1).data;
      const isRed = pixel[0] > 200 && pixel[1] < 100 && pixel[2] < 100;
      const isGreen = pixel[0] < 100 && pixel[1] > 200 && pixel[2] < 100;

      if ((i % 2 === 0 && !isRed) || (i % 2 === 1 && !isGreen)) {
        return null;
      }
    }

    const chunkIndex = parseInt(readBitCells(ctx, 0, CHUNK_INDEX_BITS), 2);
    const totalChunks = parseInt(readBitCells(ctx, 16, TOTAL_CHUNKS_BITS), 2);
    const chunkBitLength = parseInt(readBitCells(ctx, 32, CHUNK_LENGTH_BITS), 2);
    const maxBitsPerFrame = getMaxBitsPerFrame(ctx.canvas);

    if (
      !Number.isSafeInteger(chunkIndex) ||
      !Number.isSafeInteger(totalChunks) ||
      !Number.isSafeInteger(chunkBitLength) ||
      totalChunks < 1 ||
      chunkIndex >= totalChunks ||
      chunkBitLength > maxBitsPerFrame
    ) {
      return null;
    }

    return { chunkIndex, totalChunks, chunkBitLength };
  }

  function readDataCells(ctx, bitLength) {
    const { cols, rows } = getCanvasMetrics(ctx.canvas);
    const maxBits = getMaxBitsPerFrame(ctx.canvas);
    const bitsToRead = Math.min(bitLength, maxBits);
    let binaryData = '';

    for (let row = 1; row < rows && binaryData.length < bitsToRead; row++) {
      for (let col = 0; col < cols && binaryData.length < bitsToRead; col++) {
        const x = col * GRID_SIZE + Math.floor(GRID_SIZE / 2);
        const y = row * GRID_SIZE + Math.floor(GRID_SIZE / 2);
        const pixel = ctx.getImageData(x, y, 1, 1).data;
        const colorIndex = getClosestColorIndex(pixel[0], pixel[1], pixel[2]);
        binaryData += colorIndex.toString(2).padStart(COLOR_BIT_WIDTH, '0');
      }
    }

    return binaryData.slice(0, bitsToRead);
  }

  function getClosestColorIndex(r, g, b) {
    let minDistance = Infinity;
    let closestIndex = 0;

    for (let i = 0; i < RGB_COLORS.length; i++) {
      const colorRgb = RGB_COLORS[i];
      const distance =
        Math.pow(r - colorRgb.r, 2) +
        Math.pow(g - colorRgb.g, 2) +
        Math.pow(b - colorRgb.b, 2);

      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = i;
      }
    }

    return closestIndex;
  }

  function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) {
      throw new Error(`Invalid color value: ${hex}`);
    }

    return {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    };
  }

  function textToBinary(text) {
    let binaryResult = '';

    for (let i = 0; i < text.length; i++) {
      binaryResult += text.charCodeAt(i).toString(2).padStart(16, '0');
    }

    return binaryResult;
  }

  function binaryToText(binary) {
    let text = '';

    for (let i = 0; i + 16 <= binary.length; i += 16) {
      text += String.fromCharCode(parseInt(binary.slice(i, i + 16), 2));
    }

    return text;
  }

  function chunkBinaryData(binaryData, chunkSize) {
    if (!Number.isSafeInteger(chunkSize) || chunkSize < 1) {
      throw new Error('Chunk size must be a positive integer.');
    }

    const chunks = [];
    for (let i = 0; i < binaryData.length; i += chunkSize) {
      chunks.push(binaryData.slice(i, i + chunkSize));
    }

    return chunks;
  }

  return {
    GRID_SIZE,
    COLORS,
    drawMetadata,
    readMetadata,
    readDataCells,
    getClosestColorIndex,
    hexToRgb,
    textToBinary,
    binaryToText,
    chunkBinaryData,
    getMaxBitsPerFrame
  };
});
