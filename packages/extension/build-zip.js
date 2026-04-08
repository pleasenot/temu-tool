// Build script: generates temu-extension.zip for drag-and-drop installation
// Usage: node build-zip.js

var fs = require('fs');
var path = require('path');

// Simple ZIP implementation (no external dependencies)
function createZip(files) {
  var localHeaders = [];
  var centralHeaders = [];
  var offset = 0;

  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    var nameBuffer = Buffer.from(file.name, 'utf8');
    var contentBuffer = Buffer.from(file.content);

    // CRC32
    var crc = crc32(contentBuffer);

    // Local file header
    var localHeader = Buffer.alloc(30 + nameBuffer.length);
    localHeader.writeUInt32LE(0x04034b50, 0);    // signature
    localHeader.writeUInt16LE(20, 4);             // version needed
    localHeader.writeUInt16LE(0, 6);              // flags
    localHeader.writeUInt16LE(0, 8);              // compression (store)
    localHeader.writeUInt16LE(0, 10);             // mod time
    localHeader.writeUInt16LE(0, 12);             // mod date
    localHeader.writeUInt32LE(crc, 14);           // crc32
    localHeader.writeUInt32LE(contentBuffer.length, 18); // compressed size
    localHeader.writeUInt32LE(contentBuffer.length, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBuffer.length, 26);    // filename length
    localHeader.writeUInt16LE(0, 28);             // extra field length
    nameBuffer.copy(localHeader, 30);

    // Central directory header
    var centralHeader = Buffer.alloc(46 + nameBuffer.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);   // signature
    centralHeader.writeUInt16LE(20, 4);            // version made by
    centralHeader.writeUInt16LE(20, 6);            // version needed
    centralHeader.writeUInt16LE(0, 8);             // flags
    centralHeader.writeUInt16LE(0, 10);            // compression
    centralHeader.writeUInt16LE(0, 12);            // mod time
    centralHeader.writeUInt16LE(0, 14);            // mod date
    centralHeader.writeUInt32LE(crc, 16);          // crc32
    centralHeader.writeUInt32LE(contentBuffer.length, 20); // compressed
    centralHeader.writeUInt32LE(contentBuffer.length, 24); // uncompressed
    centralHeader.writeUInt16LE(nameBuffer.length, 28);    // filename length
    centralHeader.writeUInt16LE(0, 30);            // extra field length
    centralHeader.writeUInt16LE(0, 32);            // comment length
    centralHeader.writeUInt16LE(0, 34);            // disk number
    centralHeader.writeUInt16LE(0, 36);            // internal attrs
    centralHeader.writeUInt32LE(0, 38);            // external attrs
    centralHeader.writeUInt32LE(offset, 42);       // local header offset
    nameBuffer.copy(centralHeader, 46);

    localHeaders.push(Buffer.concat([localHeader, contentBuffer]));
    centralHeaders.push(centralHeader);
    offset += localHeader.length + contentBuffer.length;
  }

  var centralDirOffset = offset;
  var centralDirSize = 0;
  for (var j = 0; j < centralHeaders.length; j++) {
    centralDirSize += centralHeaders[j].length;
  }

  // End of central directory
  var eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);                        // disk number
  eocd.writeUInt16LE(0, 6);                        // disk with central dir
  eocd.writeUInt16LE(files.length, 8);             // entries on this disk
  eocd.writeUInt16LE(files.length, 10);            // total entries
  eocd.writeUInt32LE(centralDirSize, 12);          // central dir size
  eocd.writeUInt32LE(centralDirOffset, 16);        // central dir offset
  eocd.writeUInt16LE(0, 20);                       // comment length

  return Buffer.concat(localHeaders.concat(centralHeaders).concat([eocd]));
}

function crc32(buf) {
  var table = new Uint32Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  var crc = 0xFFFFFFFF;
  for (var i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Collect files
var baseDir = __dirname;
var filePaths = [
  'manifest.json',
  'src/background/service-worker.js',
  'src/content/scraper.js',
  'src/content/temu-product.js',
  'src/popup/popup.html',
  'src/popup/popup.js'
];

var files = filePaths.map(function(p) {
  return {
    name: p,
    content: fs.readFileSync(path.join(baseDir, p), 'utf8')
  };
});

var zipBuffer = createZip(files);
var outputPath = path.join(baseDir, 'temu-extension.zip');
fs.writeFileSync(outputPath, zipBuffer);
console.log('Created: ' + outputPath + ' (' + zipBuffer.length + ' bytes)');
