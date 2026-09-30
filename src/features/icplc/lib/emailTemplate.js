// Keep in sync with renderHtml() in supabase/functions/icplc-send-email/index.ts.
// The composer previews with this so what you see is what recipients get.

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function inline(escaped) {
  return escaped
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)"'])/g, '<a href="$1" style="color:#4C2A92;font-weight:600;text-decoration:underline">$1</a>')
}

export function renderEmailHtml(bodyText) {
  const paragraphs = escapeHtml(bodyText)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px">${inline(p).replaceAll('\n', '<br>')}</p>`)
    .join('')
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F4F1EA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#2D2A22">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px">
    <div style="background:#fff;border-radius:14px;overflow:hidden;border:1px solid #EDE8DC">
      <div style="background:#4C2A92;padding:22px 32px">
        <div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:-0.01em">ICPLC 2026</div>
        <div style="color:#D9CCF2;font-size:12px;margin-top:2px;letter-spacing:0.04em;text-transform:uppercase">BLW Canada Sub-Region</div>
      </div>
      <div style="padding:32px;line-height:1.65;font-size:15px">${paragraphs}</div>
    </div>
    <div style="padding:18px 8px 0;font-size:12px;color:#9E9488;text-align:center">BLW Canada Sub-Region · ICPLC 2026</div>
  </div>
</body>
</html>`
}
