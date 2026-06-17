class ZipWriter {
  constructor() {
    this.files = [];
  }

  addFile(name, data, { store = false } = {}) {
    this.files.push({ name, data, store });
  }

  async toBlob() {
    const localHeaders = [];
    const centralEntries = [];
    let offset = 0;

    for (const file of this.files) {
      const nameBytes = this._encode(file.name);
      const dataBytes = file.data;

      let compressed, crc32;

      if (file.store) {
        compressed = dataBytes;
        crc32 = this._crc32(dataBytes);
      } else {
        crc32 = this._crc32(dataBytes);
        compressed = await this._deflate(dataBytes);
      }

      const method = file.store ? 0 : 8;

      const header = this._localFileHeader(nameBytes, compressed, crc32, method);
      localHeaders.push({ header, compressed, nameBytes });
      centralEntries.push(this._centralDirEntry(nameBytes, compressed, crc32, method, offset));
      offset += header.length + compressed.length;
    }

    const centralSize = centralEntries.reduce((s, e) => s + e.length, 0);
    const eocd = this._eocd(centralEntries.length, centralSize, offset);

    const parts = [];
    for (const lh of localHeaders) {
      parts.push(lh.header, lh.compressed);
    }
    parts.push(...centralEntries, eocd);

    const total = parts.reduce((s, p) => s + p.length, 0);
    const result = new Uint8Array(total);
    let pos = 0;
    for (const p of parts) {
      result.set(p, pos);
      pos += p.length;
    }
    return new Blob([result], { type: 'application/epub+zip' });
  }

  _encode(str) {
    const encoder = new TextEncoder();
    return encoder.encode(str);
  }

  _crc32(data) {
    if (!this._crcTable) {
      this._crcTable = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
          c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        this._crcTable[i] = c;
      }
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
      crc = this._crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  async _deflate(data) {
    if (typeof CompressionStream === 'undefined') {
      return data;
    }
    const cs = new CompressionStream('deflate-raw');
    const writer = cs.writable.getWriter();
    writer.write(data);
    writer.close();
    const reader = cs.readable.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const total = chunks.reduce((s, c) => s + c.length, 0);
    const result = new Uint8Array(total);
    let pos = 0;
    for (const c of chunks) {
      result.set(c, pos);
      pos += c.length;
    }
    return result;
  }

  _localFileHeader(nameBytes, compressed, crc32, method) {
    const buf = new ArrayBuffer(30 + nameBytes.length);
    const dv = new DataView(buf);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0, true);
    dv.setUint16(8, method, true);
    dv.setUint16(10, 0, true);
    dv.setUint16(12, 0, true);
    dv.setUint32(14, crc32, true);
    dv.setUint32(18, compressed.length, true);
    dv.setUint32(22, compressed.length, true);
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true);
    const bytes = new Uint8Array(buf);
    bytes.set(nameBytes, 30);
    return bytes;
  }

  _centralDirEntry(nameBytes, compressed, crc32, method, localOffset) {
    const buf = new ArrayBuffer(46 + nameBytes.length);
    const dv = new DataView(buf);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 20, true);
    dv.setUint16(8, 0, true);
    dv.setUint16(10, method, true);
    dv.setUint16(12, 0, true);
    dv.setUint16(14, 0, true);
    dv.setUint32(16, crc32, true);
    dv.setUint32(20, compressed.length, true);
    dv.setUint32(24, compressed.length, true);
    dv.setUint16(28, nameBytes.length, true);
    dv.setUint16(30, 0, true);
    dv.setUint16(32, 0, true);
    dv.setUint16(34, 0, true);
    dv.setUint16(36, 0, true);
    dv.setUint32(38, 0, true);
    dv.setUint32(42, localOffset, true);
    const bytes = new Uint8Array(buf);
    bytes.set(nameBytes, 46);
    return bytes;
  }

  _eocd(numEntries, centralSize, centralOffset) {
    const buf = new ArrayBuffer(22);
    const dv = new DataView(buf);
    dv.setUint32(0, 0x06054b50, true);
    dv.setUint16(4, 0, true);
    dv.setUint16(6, 0, true);
    dv.setUint16(8, numEntries, true);
    dv.setUint16(10, numEntries, true);
    dv.setUint32(12, centralSize, true);
    dv.setUint32(16, centralOffset, true);
    dv.setUint16(20, 0, true);
    return new Uint8Array(buf);
  }
}
