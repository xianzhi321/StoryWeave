(() => {
  'use strict';

  const maxEntryBytes = 2 * 1024 * 1024;
  const maxTotalBytes = 6 * 1024 * 1024;

  async function inflate(bytes, expected) {
    if (typeof DecompressionStream === 'undefined') {
      throw Error('当前 WebView 不支持 EPUB 解压，请转换为 TXT');
    }
    let reader;
    try {
      reader = new Blob([bytes])
        .stream()
        .pipeThrough(new DecompressionStream('deflate-raw'))
        .getReader();
    } catch (_) {
      throw Error('当前 WebView 不支持 EPUB 解压，请转换为 TXT');
    }
    const output = new Uint8Array(expected);
    let written = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value.length > output.length - written) {
          throw Error('EPUB 实际解压大小超过声明，已停止解压');
        }
        output.set(value, written);
        written += value.length;
      }
      if (written !== expected) throw Error('EPUB 实际解压大小与声明不符');
      return output;
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
  }

  async function unzipEntries(buffer, { includePackage = false } = {}) {
    const bytes = new Uint8Array(buffer);
    const data = new DataView(buffer);
    const word = (offset) => data.getUint16(offset, true);
    const dword = (offset) => data.getUint32(offset, true);
    let end = -1;
    for (
      let i = bytes.length - 22;
      i >= Math.max(0, bytes.length - 65557);
      i--
    ) {
      if (dword(i) === 0x06054b50 && i + 22 + word(i + 20) === bytes.length) {
        end = i;
        break;
      }
    }
    if (end < 0) throw Error('EPUB 文件不是有效的 ZIP 格式');
    const count = word(end + 10);
    if (word(end + 4) || word(end + 6) || word(end + 8) !== count) {
      throw Error('不支持分卷 ZIP 格式的 EPUB');
    }
    if (count > 400) throw Error('EPUB 包含过多文件，请先转换为 TXT');
    const centralStart = dword(end + 16);
    const centralEnd = centralStart + dword(end + 12);
    if (centralEnd > end) throw Error('EPUB 文件目录越界');

    const entries = [];
    const names = new Set();
    const decoder = new TextDecoder();
    let offset = centralStart;
    let total = 0;
    for (let i = 0; i < count; i++) {
      if (offset + 46 > centralEnd || dword(offset) !== 0x02014b50) {
        throw Error('EPUB 目录结构损坏');
      }
      const flags = word(offset + 8);
      const method = word(offset + 10);
      const compressed = dword(offset + 20);
      const expected = dword(offset + 24);
      const nameLength = word(offset + 28);
      const local = dword(offset + 42);
      const next =
        offset + 46 + nameLength + word(offset + 30) + word(offset + 32);
      if (next > centralEnd) throw Error('EPUB 文件目录越界');
      const name = decoder.decode(
        bytes.subarray(offset + 46, offset + 46 + nameLength)
      );
      offset = next;
      const packageFile =
        includePackage &&
        (name === 'META-INF/container.xml' || /\.opf$/i.test(name));
      if (!packageFile && !/\.(xhtml|html|htm)$/i.test(name)) continue;
      if (names.has(name)) throw Error('EPUB 中有重名的正文或目录文件');
      names.add(name);
      if (flags & 1) throw Error('不支持导入加密的 EPUB');
      if (expected > maxEntryBytes || total + expected > maxTotalBytes) {
        throw Error('EPUB 解压后的正文过大，请转换为 TXT');
      }
      if (
        local + 30 > centralStart ||
        dword(local) !== 0x04034b50 ||
        word(local + 8) !== method ||
        word(local + 6) & 1
      ) {
        throw Error('EPUB 章节数据损坏');
      }
      const start = local + 30 + word(local + 26) + word(local + 28);
      if (start + compressed > centralStart) throw Error('EPUB 章节数据越界');
      const source = bytes.subarray(start, start + compressed);
      let decoded;
      if (method === 0 && compressed === expected) decoded = source;
      else if (method === 8) decoded = await inflate(source, expected);
      else throw Error('EPUB 压缩方式不受支持，或文件大小记录有误');
      total += decoded.length;
      entries.push({ name, text: decoder.decode(decoded) });
    }
    return entries;
  }

  window.StoryWeaveEpub = { unzipEntries };
})();
