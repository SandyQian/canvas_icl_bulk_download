// Minimal zip writer (deflate or store, UTF-8 names, no zip64: under 4 GB total).
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

async function deflateRaw(bytes) {
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

class ZipWriter {
  constructor() {
    this.parts = [];
    this.central = [];
    this.offset = 0;
    this.count = 0;
    const d = new Date();
    this.dosTime =
      (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    this.dosDate =
      ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  }

  // path uses "/" separators, e.g. "Week 1/notes.pdf"
  async add(path, bytes) {
    const name = new TextEncoder().encode(path);
    const crc = crc32(bytes);
    let data = await deflateRaw(bytes);
    let method = 8;
    if (data.length >= bytes.length) {
      data = bytes;
      method = 0;
    }

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 file names
    local.setUint16(8, method, true);
    local.setUint16(10, this.dosTime, true);
    local.setUint16(12, this.dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, bytes.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, method, true);
    central.setUint16(12, this.dosTime, true);
    central.setUint16(14, this.dosDate, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, bytes.length, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, this.offset, true);

    this.parts.push(local.buffer, name, data);
    this.central.push(central.buffer, name);
    this.offset += 30 + name.length + data.length;
    this.count++;
    if (this.offset > 0xffffffff || this.count > 0xffff) {
      throw new Error("Course files are too large for a single zip (4 GB limit).");
    }
  }

  finish() {
    let centralSize = 0;
    for (const p of this.central) centralSize += p.byteLength;
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, this.count, true);
    end.setUint16(10, this.count, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, this.offset, true);
    return new Blob([...this.parts, ...this.central, end.buffer], {
      type: "application/zip",
    });
  }
}

if (typeof module !== "undefined") module.exports = { ZipWriter };
