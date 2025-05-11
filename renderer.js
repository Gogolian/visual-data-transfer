// Constants for visual encoding
const GRID_SIZE = 10; // Size of each data cell in pixels
const COLORS = [
  '#FF0000', // Red
  '#00FF00', // Green
  '#0000FF', // Blue
  '#FFFF00', // Yellow
  '#FF00FF', // Magenta
  '#00FFFF', // Cyan
  '#FFFFFF', // White
  '#000000'  // Black
];

// Application state
let mode = null; // 'sender' or 'receiver'
let folderPath = null;
let destinationPath = null;
let serializedData = null;
let dataChunks = null;
let currentChunkIndex = 0;
let isFullscreen = false;
let mediaStream = null;
let videoTrack = null;

// DOM Elements
const senderModeBtn = document.getElementById('sender-mode-btn');
const receiverModeBtn = document.getElementById('receiver-mode-btn');
const senderControls = document.getElementById('sender-controls');
const receiverControls = document.getElementById('receiver-controls');
const selectFolderBtn = document.getElementById('select-folder-btn');
const startTransmissionBtn = document.getElementById('start-transmission-btn');
const nextSlideBtn = document.getElementById('next-slide-btn');
const stopTransmissionBtn = document.getElementById('stop-transmission-btn');
const selectDestinationBtn = document.getElementById('select-destination-btn');
const startReceivingBtn = document.getElementById('start-receiving-btn');
const captureSlideBtn = document.getElementById('capture-slide-btn');
const stopReceivingBtn = document.getElementById('stop-receiving-btn');
const senderCanvas = document.getElementById('sender-canvas');
const receiverCanvas = document.getElementById('receiver-canvas');
const videoPreview = document.getElementById('video-preview');
const statusMessage = document.getElementById('status-message');
const progressContainer = document.getElementById('progress-container');
const progressText = document.getElementById('progress-text');
const progressFill = document.getElementById('progress-fill');

// Canvas contexts
const senderCtx = senderCanvas.getContext('2d');
const receiverCtx = receiverCanvas.getContext('2d');

// Event Listeners
senderModeBtn.addEventListener('click', () => setMode('sender'));
receiverModeBtn.addEventListener('click', () => setMode('receiver'));
selectFolderBtn.addEventListener('click', selectFolder);
startTransmissionBtn.addEventListener('click', startTransmission);
nextSlideBtn.addEventListener('click', showNextChunk);
stopTransmissionBtn.addEventListener('click', stopTransmission);
selectDestinationBtn.addEventListener('click', selectDestinationFolder);
startReceivingBtn.addEventListener('click', startReceiving);
captureSlideBtn.addEventListener('click', captureSlide);
stopReceivingBtn.addEventListener('click', stopReceiving);

// Function to set the application mode
function setMode(newMode) {
  mode = newMode;
  
  if (mode === 'sender') {
    senderControls.classList.remove('hidden');
    receiverControls.classList.add('hidden');
    senderCanvas.classList.remove('hidden');
    receiverCanvas.classList.add('hidden');
    videoPreview.classList.add('hidden');
    statusMessage.textContent = 'Sender Mode: Select a folder to transmit';
  } else if (mode === 'receiver') {
    senderControls.classList.add('hidden');
    receiverControls.classList.remove('hidden');
    senderCanvas.classList.add('hidden');
    receiverCanvas.classList.remove('hidden');
    videoPreview.classList.remove('hidden');
    statusMessage.textContent = 'Receiver Mode: Select a destination folder';
  }
}

// Function to select folder to send
async function selectFolder() {
  folderPath = await window.ipcRenderer.invoke('select-folder');
  
  if (folderPath) {
    statusMessage.textContent = `Selected folder: ${folderPath}`;
    startTransmissionBtn.disabled = false;
  }
}

// Function to select destination folder
async function selectDestinationFolder() {
  destinationPath = await window.ipcRenderer.invoke('select-folder');
  
  if (destinationPath) {
    statusMessage.textContent = `Selected destination: ${destinationPath}`;
    startReceivingBtn.disabled = false;
  }
}

// Function to prepare data for transmission
async function startTransmission() {
  try {
    statusMessage.textContent = 'Preparing folder data...';
    serializedData = await window.ipcRenderer.invoke('prepare-folder-data', folderPath);
    
    if (!serializedData) {
      statusMessage.textContent = 'Error preparing folder data!';
      return;
    }
    
    // Prepare chunks - we'll encode 3 bits per cell (8 colors = 2^3 bits)
    const binaryData = textToBinary(serializedData);
    dataChunks = chunkBinaryData(binaryData, getMaxBitsPerFrame());
    
    statusMessage.textContent = `Ready to transmit ${dataChunks.length} slides`;
    startTransmissionBtn.disabled = true;
    nextSlideBtn.disabled = false;
    stopTransmissionBtn.disabled = false;
    
    currentChunkIndex = 0;
    progressContainer.classList.remove('hidden');
    updateProgress(0, dataChunks.length);
    
    // Show the first chunk
    showNextChunk();
  } catch (error) {
    console.error('Error starting transmission:', error);
    statusMessage.textContent = 'Error starting transmission!';
  }
}

// Function to get maximum bits per frame based on canvas size
function getMaxBitsPerFrame() {
  const cols = Math.floor(senderCanvas.width / GRID_SIZE);
  const rows = Math.floor(senderCanvas.height / GRID_SIZE);
  // Each cell encodes 3 bits (8 colors)
  // Reserve top row for metadata (chunk index, total chunks)
  return (cols * (rows - 1)) * 3;
}

// Function to start receiving data
async function startReceiving() {
  try {
    await setupCamera();
    statusMessage.textContent = 'Camera ready. Position camera to capture sender screen.';
    startReceivingBtn.disabled = true;
    captureSlideBtn.disabled = false;
    stopReceivingBtn.disabled = false;
    
    // Initialize receiving data structures
    currentChunkIndex = 0;
    dataChunks = [];
    progressContainer.classList.remove('hidden');
  } catch (error) {
    console.error('Error starting reception:', error);
    statusMessage.textContent = 'Error accessing camera!';
  }
}

// Function to setup camera
async function setupCamera() {
  mediaStream = await navigator.mediaDevices.getUserMedia({ 
    video: { width: 1280, height: 720 }, 
    audio: false 
  });
  
  videoPreview.srcObject = mediaStream;
  videoTrack = mediaStream.getVideoTracks()[0];
  await videoPreview.play();
}

// Function to toggle fullscreen
function toggleFullscreen(element) {
  if (!isFullscreen) {
    if (element.requestFullscreen) {
      element.requestFullscreen();
    } else if (element.webkitRequestFullscreen) {
      element.webkitRequestFullscreen();
    } else if (element.msRequestFullscreen) {
      element.msRequestFullscreen();
    }
    element.classList.add('fullscreen');
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
    element.classList.remove('fullscreen');
  }
  
  isFullscreen = !isFullscreen;
}

// Function to show next chunk of data
function showNextChunk() {
  if (currentChunkIndex >= dataChunks.length) {
    statusMessage.textContent = 'Transmission complete!';
    nextSlideBtn.disabled = true;
    stopTransmissionBtn.disabled = false;
    return;
  }
  
  // Clear canvas
  senderCtx.fillStyle = '#000000';
  senderCtx.fillRect(0, 0, senderCanvas.width, senderCanvas.height);
  
  // Draw header information
  drawMetadata(senderCtx, currentChunkIndex, dataChunks.length);
  
  // Draw data cells
  const chunk = dataChunks[currentChunkIndex];
  const cols = Math.floor(senderCanvas.width / GRID_SIZE);
  const rows = Math.floor(senderCanvas.height / GRID_SIZE);
  
  for (let i = 0; i < chunk.length; i += 3) {
    // Group bits into 3-bit chunks for color encoding
    const colorIndex = parseInt(chunk.substr(i, Math.min(3, chunk.length - i)), 2);
    
    // Calculate position (skip top row, which is for metadata)
    const cellIndex = Math.floor(i / 3);
    const row = Math.floor(cellIndex / cols) + 1; // +1 to skip metadata row
    const col = cellIndex % cols;
    
    // Draw the cell
    if (row < rows) {
      senderCtx.fillStyle = COLORS[colorIndex];
      senderCtx.fillRect(col * GRID_SIZE, row * GRID_SIZE, GRID_SIZE, GRID_SIZE);
    }
  }
  
  // Update progress indicator
  updateProgress(currentChunkIndex + 1, dataChunks.length);
  statusMessage.textContent = `Showing slide ${currentChunkIndex + 1} of ${dataChunks.length}`;
  
  // Make sure canvas is fullscreen for sender
  if (!isFullscreen) {
    toggleFullscreen(senderCanvas);
  }
}

// Function to draw metadata in the top row of the canvas
function drawMetadata(ctx, chunkIndex, totalChunks) {
  const cols = Math.floor(ctx.canvas.width / GRID_SIZE);
  
  // Convert numbers to binary
  const chunkIndexBinary = chunkIndex.toString(2).padStart(16, '0');
  const totalChunksBinary = totalChunks.toString(2).padStart(16, '0');
  
  // Draw chunk index (first 16 cells)
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = chunkIndexBinary[i] === '1' ? '#FFFFFF' : '#000000';
    ctx.fillRect(i * GRID_SIZE, 0, GRID_SIZE, GRID_SIZE);
  }
  
  // Draw total chunks (next 16 cells)
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = totalChunksBinary[i] === '1' ? '#FFFFFF' : '#000000';
    ctx.fillRect((i + 16) * GRID_SIZE, 0, GRID_SIZE, GRID_SIZE);
  }
  
  // Draw checksum pattern (remaining cells)
  for (let i = 32; i < cols; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#FF0000' : '#00FF00';
    ctx.fillRect(i * GRID_SIZE, 0, GRID_SIZE, GRID_SIZE);
  }
}

// Function to capture slide from camera
function captureSlide() {
  // Draw video frame to receiver canvas
  receiverCtx.drawImage(videoPreview, 0, 0, receiverCanvas.width, receiverCanvas.height);
  
  // Process the captured image
  processReceivedSlide();
}

// Function to process received slide
function processReceivedSlide() {
  try {
    // Read metadata from top row
    const metadata = readMetadata();
    
    if (!metadata) {
      statusMessage.textContent = 'Could not read metadata. Adjust camera position and try again.';
      return;
    }
    
    const { chunkIndex, totalChunks } = metadata;
    
    // Read data cells
    const binaryData = readDataCells();
    
    // Store the chunk
    if (dataChunks[chunkIndex]) {
      // If we already have this chunk, verify it matches
      if (dataChunks[chunkIndex] !== binaryData) {
        statusMessage.textContent = `Warning: Chunk ${chunkIndex + 1} data mismatch. Recapturing.`;
      } else {
        statusMessage.textContent = `Verified chunk ${chunkIndex + 1} of ${totalChunks}`;
      }
    } else {
      dataChunks[chunkIndex] = binaryData;
      statusMessage.textContent = `Captured chunk ${chunkIndex + 1} of ${totalChunks}`;
    }
    
    // Update progress
    updateProgress(countCapturedChunks(), totalChunks);
    
    // Check if we have all chunks
    if (countCapturedChunks() === totalChunks) {
      recreateData();
    }
  } catch (error) {
    console.error('Error processing slide:', error);
    statusMessage.textContent = 'Error processing slide! Try recapturing.';
  }
}

// Function to read metadata from the top row
function readMetadata() {
  const cols = Math.floor(receiverCanvas.width / GRID_SIZE);
  const imageData = receiverCtx.getImageData(0, 0, cols * GRID_SIZE, GRID_SIZE);
  const data = imageData.data;
  
  let chunkIndexBinary = '';
  let totalChunksBinary = '';
  
  // Read chunk index (first 16 cells)
  for (let i = 0; i < 16; i++) {
    const pixelIndex = (i * GRID_SIZE + Math.floor(GRID_SIZE / 2)) * 4;
    const r = data[pixelIndex];
    const g = data[pixelIndex + 1];
    const b = data[pixelIndex + 2];
    const brightness = (r + g + b) / 3;
    chunkIndexBinary += brightness > 128 ? '1' : '0';
  }
  
  // Read total chunks (next 16 cells)
  for (let i = 0; i < 16; i++) {
    const pixelIndex = ((i + 16) * GRID_SIZE + Math.floor(GRID_SIZE / 2)) * 4;
    const r = data[pixelIndex];
    const g = data[pixelIndex + 1];
    const b = data[pixelIndex + 2];
    const brightness = (r + g + b) / 3;
    totalChunksBinary += brightness > 128 ? '1' : '0';
  }
  
  // Validate checksum pattern
  let validChecksum = true;
  for (let i = 32; i < Math.min(cols, 40); i++) {
    const pixelIndex = (i * GRID_SIZE + Math.floor(GRID_SIZE / 2)) * 4;
    const r = data[pixelIndex];
    const g = data[pixelIndex + 1];
    const b = data[pixelIndex + 2];
    
    const isRed = r > 200 && g < 100 && b < 100;
    const isGreen = r < 100 && g > 200 && b < 100;
    
    if ((i % 2 === 0 && !isRed) || (i % 2 === 1 && !isGreen)) {
      validChecksum = false;
      break;
    }
  }
  
  if (!validChecksum) {
    return null;
  }
  
  const chunkIndex = parseInt(chunkIndexBinary, 2);
  const totalChunks = parseInt(totalChunksBinary, 2);
  
  return { chunkIndex, totalChunks };
}

// Function to read data cells from the canvas
function readDataCells() {
  const cols = Math.floor(receiverCanvas.width / GRID_SIZE);
  const rows = Math.floor(receiverCanvas.height / GRID_SIZE);
  
  let binaryData = '';
  
  for (let row = 1; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // Sample from the center of each cell
      const x = col * GRID_SIZE + Math.floor(GRID_SIZE / 2);
      const y = row * GRID_SIZE + Math.floor(GRID_SIZE / 2);
      
      const pixel = receiverCtx.getImageData(x, y, 1, 1).data;
      const colorIndex = getClosestColorIndex(pixel[0], pixel[1], pixel[2]);
      
      // Convert color index to 3 bits
      const bits = colorIndex.toString(2).padStart(3, '0');
      binaryData += bits;
    }
  }
  
  return binaryData;
}

// Function to find the closest matching color index
function getClosestColorIndex(r, g, b) {
  let minDistance = Infinity;
  let closestIndex = 0;
  
  for (let i = 0; i < COLORS.length; i++) {
    const color = COLORS[i];
    const colorRgb = hexToRgb(color);
    
    const distance = Math.sqrt(
      Math.pow(r - colorRgb.r, 2) +
      Math.pow(g - colorRgb.g, 2) +
      Math.pow(b - colorRgb.b, 2)
    );
    
    if (distance < minDistance) {
      minDistance = distance;
      closestIndex = i;
    }
  }
  
  return closestIndex;
}

// Function to convert hex color to RGB
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

// Function to count captured chunks
function countCapturedChunks() {
  return dataChunks.filter(chunk => chunk !== undefined && chunk !== null).length;
}

// Function to recreate data from chunks
async function recreateData() {
  try {
    statusMessage.textContent = 'All chunks received. Reconstructing data...';
    
    // Combine all binary chunks
    const fullBinaryData = dataChunks.join('');
    
    // Convert binary back to text
    const reconstructedText = binaryToText(fullBinaryData);
    
    // Save reconstructed data
    const success = await window.ipcRenderer.invoke('save-folder-data', reconstructedText, destinationPath);
    
    if (success) {
      statusMessage.textContent = 'Data successfully received and saved!';
    } else {
      statusMessage.textContent = 'Error saving reconstructed data!';
    }
    
    captureSlideBtn.disabled = true;
  } catch (error) {
    console.error('Error recreating data:', error);
    statusMessage.textContent = 'Error reconstructing data!';
  }
}

// Function to update progress indicators
function updateProgress(current, total) {
  const percentage = Math.round((current / total) * 100);
  progressText.textContent = `${percentage}% (${current}/${total})`;
  progressFill.style.width = `${percentage}%`;
}

// Function to stop transmission
function stopTransmission() {
  if (isFullscreen) {
    toggleFullscreen(senderCanvas);
  }
  
  startTransmissionBtn.disabled = false;
  nextSlideBtn.disabled = true;
  stopTransmissionBtn.disabled = true;
  statusMessage.textContent = 'Transmission stopped';
  progressContainer.classList.add('hidden');
}

// Function to stop receiving
function stopReceiving() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
  
  startReceivingBtn.disabled = false;
  captureSlideBtn.disabled = true;
  stopReceivingBtn.disabled = true;
  statusMessage.textContent = 'Reception stopped';
  progressContainer.classList.add('hidden');
}

// Utility function to convert text to binary string
function textToBinary(text) {
  let binaryResult = '';
  
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    const binary = charCode.toString(2).padStart(16, '0'); // 16 bits per character (supports Unicode)
    binaryResult += binary;
  }
  
  return binaryResult;
}

// Utility function to convert binary string back to text
function binaryToText(binary) {
  let text = '';
  
  for (let i = 0; i < binary.length; i += 16) {
    const chunk = binary.substr(i, 16);
    if (chunk.length === 16) {
      const charCode = parseInt(chunk, 2);
      text += String.fromCharCode(charCode);
    }
  }
  
  return text;
}

// Utility function to chunk binary data
function chunkBinaryData(binaryData, chunkSize) {
  const chunks = [];
  
  for (let i = 0; i < binaryData.length; i += chunkSize) {
    chunks.push(binaryData.substr(i, chunkSize));
  }
  
  return chunks;
}
