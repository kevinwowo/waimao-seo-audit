// 二维码渲染：优先用真实图片（个人微信码必须用图片，无法由文本重建），
// 退到由 qrCodeText 生成，再退到占位。
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function qrInner(contact, color, extraDirs = []) {
  // 1) 真实二维码图片（推荐用于个人微信码）
  if (contact.qrImage && !/^\[/.test(contact.qrImage)) {
    const dirs = [process.cwd(), ROOT, ...extraDirs];
    for (const d of dirs) {
      try {
        const p = path.isAbsolute(contact.qrImage) ? contact.qrImage : path.join(d, contact.qrImage);
        const buf = await fs.readFile(p);
        const ext = (path.extname(p).slice(1) || 'png').toLowerCase();
        const mime = ext === 'jpg' ? 'jpeg' : (ext === 'svg' ? 'svg+xml' : ext);
        return { html: `<img src="data:image/${mime};base64,${buf.toString('base64')}" alt="微信二维码" style="width:100%;height:100%;object-fit:contain;display:block;border-radius:6px;" />`, hasQr: true };
      } catch { /* try next dir */ }
    }
  }
  // 2) 由文本生成（适合公众号/企业微信等稳定链接）
  if (contact.qrCodeText && !/^\[/.test(contact.qrCodeText)) {
    try {
      const svg = await QRCode.toString(contact.qrCodeText, { type: 'svg', margin: 1, width: 180, color: { dark: color, light: '#ffffff' } });
      return { html: svg, hasQr: true };
    } catch { /* fall through */ }
  }
  // 3) 占位
  return { html: '', hasQr: false };
}
