const assert = require('assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { recreateFolder, scanFolder } = require('../folder-transfer');

test('scans and recreates a folder with nested files', async () => {
  const sourceParent = await fs.mkdtemp(path.join(os.tmpdir(), 'vdt-source-'));
  const destinationParent = await fs.mkdtemp(path.join(os.tmpdir(), 'vdt-destination-'));
  const source = path.join(sourceParent, 'payload');

  await fs.mkdir(path.join(source, 'nested'), { recursive: true });
  await fs.writeFile(path.join(source, 'hello.txt'), 'hello');
  await fs.writeFile(path.join(source, 'nested', 'data.bin'), Buffer.from([0, 1, 2, 255]));

  const folderData = await scanFolder(source);
  await recreateFolder(folderData, destinationParent);

  assert.equal(await fs.readFile(path.join(destinationParent, 'payload', 'hello.txt'), 'utf8'), 'hello');
  assert.deepEqual(
    await fs.readFile(path.join(destinationParent, 'payload', 'nested', 'data.bin')),
    Buffer.from([0, 1, 2, 255])
  );
});

test('rejects payload paths that would escape the destination', async () => {
  const destinationParent = await fs.mkdtemp(path.join(os.tmpdir(), 'vdt-destination-'));

  await assert.rejects(
    recreateFolder(
      {
        name: '..',
        type: 'folder',
        children: []
      },
      destinationParent
    ),
    /Unsafe path segment/
  );
});
