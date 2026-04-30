const {
  GRID_SIZE,
  COLORS,
  COLOR_BIT_WIDTH,
  MAX_CHUNKS,
  drawMetadata,
  readMetadata,
  readDataCells,
  getColorIndexForBits,
  textToBinary,
  binaryToText,
  chunkBinaryData,
  getMaxBitsPerFrame
} = window.VisualTransferCore;

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
let expectedTotalChunks = null;

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
  folderPath = await window.visualDataTransfer.selectFolder();
  
  if (folderPath) {
    statusMessage.textContent = `Selected folder: ${folderPath}`;
    startTransmissionBtn.disabled = false;
  }
}

// Function to select destination folder
async function selectDestinationFolder() {
  destinationPath = await window.visualDataTransfer.selectFolder();
  
  if (destinationPath) {
    statusMessage.textContent = `Selected destination: ${destinationPath}`;
    startReceivingBtn.disabled = false;
  }
}

// Function to prepare data for transmission
async function startTransmission() {
  try {
    statusMessage.textContent = 'Preparing folder data...';
    serializedData = await window.visualDataTransfer.prepareFolderData(folderPath);
    
    if (!serializedData) {
      statusMessage.textContent = 'Error preparing folder data!';
      return;
    }
    
    const maxBitsPerFrame = getMaxBitsPerFrame(senderCanvas);
    if (maxBitsPerFrame < 1) {
      statusMessage.textContent = 'Canvas is too small to transmit data.';
      return;
    }

    const binaryData = textToBinary(serializedData);
    dataChunks = chunkBinaryData(binaryData, maxBitsPerFrame, MAX_CHUNKS);
    
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
    expectedTotalChunks = null;
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
  
  // Draw data cells
  const chunk = dataChunks[currentChunkIndex];
  const displayChunkIndex = currentChunkIndex;
  drawMetadata(senderCtx, displayChunkIndex, dataChunks.length, chunk.length);

  const cols = Math.floor(senderCanvas.width / GRID_SIZE);
  const rows = Math.floor(senderCanvas.height / GRID_SIZE);
  
  for (let i = 0; i < chunk.length; i += COLOR_BIT_WIDTH) {
    // Group bits for color encoding
    const colorIndex = getColorIndexForBits(chunk.slice(i, i + COLOR_BIT_WIDTH));
    
    // Calculate position (skip top row, which is for metadata)
    const cellIndex = Math.floor(i / COLOR_BIT_WIDTH);
    const row = Math.floor(cellIndex / cols) + 1; // +1 to skip metadata row
    const col = cellIndex % cols;
    
    // Draw the cell
    if (row < rows) {
      senderCtx.fillStyle = COLORS[colorIndex];
      senderCtx.fillRect(col * GRID_SIZE, row * GRID_SIZE, GRID_SIZE, GRID_SIZE);
    }
  }
  
  // Update progress indicator
  updateProgress(displayChunkIndex + 1, dataChunks.length);
  statusMessage.textContent = `Showing slide ${displayChunkIndex + 1} of ${dataChunks.length}`;
  currentChunkIndex++;
  
  // Make sure canvas is fullscreen for sender
  if (!isFullscreen) {
    toggleFullscreen(senderCanvas);
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
    const metadata = readMetadata(receiverCtx);
    
    if (!metadata) {
      statusMessage.textContent = 'Could not read metadata. Adjust camera position and try again.';
      return;
    }
    
    const { chunkIndex, totalChunks, chunkBitLength } = metadata;

    if (expectedTotalChunks === null) {
      expectedTotalChunks = totalChunks;
      dataChunks.length = totalChunks;
    } else if (totalChunks !== expectedTotalChunks) {
      statusMessage.textContent = `Ignoring slide from a different transfer (${totalChunks} chunks, expected ${expectedTotalChunks}).`;
      return;
    }
    
    // Read data cells
    const binaryData = readDataCells(receiverCtx, chunkBitLength);
    
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
    updateProgress(countCapturedChunks(), expectedTotalChunks);
    
    // Check if we have all chunks
    if (countCapturedChunks() === expectedTotalChunks) {
      recreateData();
    }
  } catch (error) {
    console.error('Error processing slide:', error);
    statusMessage.textContent = 'Error processing slide! Try recapturing.';
  }
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
    const success = await window.visualDataTransfer.saveFolderData(reconstructedText, destinationPath);
    
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
  if (!Number.isSafeInteger(total) || total < 1) {
    progressText.textContent = 'Progress unavailable';
    progressFill.style.width = '0%';
    return;
  }

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
  expectedTotalChunks = null;
}
