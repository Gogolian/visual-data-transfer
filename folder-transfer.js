const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

function hashBuffer(buffer, algorithm = 'sha256') {
  return crypto.createHash(algorithm).update(buffer).digest('hex');
}

function validatePathSegment(name) {
  if (
    typeof name !== 'string' ||
    name.length === 0 ||
    name === '.' ||
    name === '..' ||
    path.isAbsolute(name) ||
    name.includes(path.posix.sep) ||
    name.includes(path.win32.sep)
  ) {
    throw new Error(`Unsafe path segment: ${name}`);
  }
}

function safeJoin(rootPath, name) {
  validatePathSegment(name);

  const resolvedRoot = path.resolve(rootPath);
  const resolvedTarget = path.resolve(resolvedRoot, name);
  const relative = path.relative(resolvedRoot, resolvedTarget);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to write outside destination: ${name}`);
  }

  return resolvedTarget;
}

async function assertDirectory(directoryPath) {
  const stats = await fs.stat(directoryPath);
  if (!stats.isDirectory()) {
    throw new Error(`Not a directory: ${directoryPath}`);
  }
}

async function scanFolder(rootPath, relativePath = '') {
  await assertDirectory(rootPath);

  const folderData = {
    name: path.basename(rootPath),
    type: 'folder',
    path: relativePath,
    children: []
  };

  const entries = await fs.readdir(rootPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name);
    const entryRelativePath = path.join(relativePath, entry.name);

    if (entry.isDirectory()) {
      folderData.children.push(await scanFolder(entryPath, entryRelativePath));
    } else if (entry.isFile()) {
      const fileContent = await fs.readFile(entryPath);

      folderData.children.push({
        name: entry.name,
        type: 'file',
        path: entryRelativePath,
        content: fileContent.toString('base64'),
        hash: hashBuffer(fileContent),
        hashAlgorithm: 'sha256',
        size: fileContent.length
      });
    }
  }

  return folderData;
}

async function recreateFolder(folderData, rootPath) {
  await assertDirectory(rootPath);
  await writeFolder(folderData, rootPath);
}

async function writeFolder(folderData, rootPath) {
  if (!folderData || folderData.type !== 'folder' || !Array.isArray(folderData.children)) {
    throw new Error('Invalid folder payload.');
  }

  const folderPath = safeJoin(rootPath, folderData.name);
  await fs.mkdir(folderPath, { recursive: true });

  for (const child of folderData.children) {
    if (!child || typeof child !== 'object') {
      throw new Error('Invalid child payload.');
    }

    if (child.type === 'folder') {
      await writeFolder(child, folderPath);
    } else if (child.type === 'file') {
      await writeFile(child, folderPath);
    } else {
      throw new Error(`Unsupported payload type: ${child.type}`);
    }
  }
}

async function writeFile(fileData, folderPath) {
  validatePathSegment(fileData.name);

  if (typeof fileData.content !== 'string') {
    throw new Error(`Missing file content for ${fileData.name}`);
  }

  const fileContent = Buffer.from(fileData.content, 'base64');
  if (Number.isSafeInteger(fileData.size) && fileData.size !== fileContent.length) {
    throw new Error(`File size mismatch for ${fileData.name}`);
  }

  const algorithm = fileData.hashAlgorithm === 'sha256' ? 'sha256' : 'md5';
  const fileHash = hashBuffer(fileContent, algorithm);
  if (typeof fileData.hash === 'string' && fileHash !== fileData.hash) {
    throw new Error(`File integrity check failed for ${fileData.name}`);
  }

  await fs.writeFile(safeJoin(folderPath, fileData.name), fileContent);
}

module.exports = {
  scanFolder,
  recreateFolder,
  validatePathSegment,
  safeJoin
};
