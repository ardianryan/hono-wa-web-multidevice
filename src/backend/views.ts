// ─────────────────────────────────────────────────────────────────────────────
// views.ts — Template HTML untuk halaman QR dan status sesi
// ─────────────────────────────────────────────────────────────────────────────

export const htmlPage = (body: string) => `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
  <link href="https://fonts.bunny.net/css?family=poppins:300,400,500,600,700,800" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root { --app-font: "Poppins", -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    body {
      font-family: var(--app-font) !important;
      background: #ece5dd;
      display: flex; justify-content: center; align-items: center;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
    }
    * { font-family: inherit; }
    .card {
      background: white; border-radius: 1.5rem;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      padding: 2.5rem 3rem; text-align: center;
      max-width: 440px; width: 90%;
    }
    .icon { font-size: 3rem; margin-bottom: 0.5rem; }
    h1 { font-size: 1.4rem; color: #111b21; margin-bottom: 0.5rem; }
    p { color: #667781; font-size: 0.9rem; line-height: 1.6; margin-top: 0.5rem; }
    .badge {
      display: inline-block; background: #25d366; color: white;
      font-size: 0.75rem; padding: 3px 12px; border-radius: 999px;
      margin-bottom: 1.5rem; font-weight: 600;
    }
    .steps {
      text-align: left; font-size: 0.85rem; color: #555;
      line-height: 1.9; padding-left: 1.2rem;
    }
    .note { margin-top: 1rem; font-size: 0.75rem; color: #aaa; }
    .btn {
      display: inline-block; margin-top: 1.5rem; padding: 0.6rem 1.8rem;
      background: #25d366; color: white; border-radius: 999px;
      text-decoration: none; font-size: 0.9rem; font-weight: 600;
    }
  </style>
</head>
<body style="font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;">
  <div class="card">${body}</div>
</body>
</html>`;

export const htmlQRPage = (sessionId: string, qrImageUrl: string) => `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Scan QR – ${sessionId}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
  <link href="https://fonts.bunny.net/css?family=poppins:300,400,500,600,700,800" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root { --app-font: "Poppins", -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    body {
      font-family: var(--app-font) !important;
      background: #ece5dd;
      display: flex; justify-content: center; align-items: center;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
    }
    * { font-family: inherit; }
    .card {
      background: white; border-radius: 1.5rem;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      padding: 2.5rem 3rem; text-align: center;
      max-width: 440px; width: 90%;
    }
    .logo { font-size: 2.5rem; margin-bottom: 0.5rem; }
    h1 { font-size: 1.4rem; color: #111b21; margin-bottom: 0.3rem; }
    .badge {
      display: inline-block; background: #25d366; color: white;
      font-size: 0.75rem; padding: 3px 12px; border-radius: 999px;
      margin-bottom: 1.5rem; font-weight: 600;
    }
    .qr-wrapper {
      border: 3px solid #25d366; border-radius: 1rem;
      padding: 1rem; display: inline-block; margin-bottom: 1.5rem;
    }
    .qr-wrapper img { display: block; width: 260px; height: 260px; }
    .steps {
      text-align: left; font-size: 0.85rem; color: #555;
      line-height: 1.9; padding-left: 1.2rem; margin-bottom: 0.5rem;
    }
    .note { font-size: 0.75rem; color: #aaa; margin-top: 1rem; }
    .timer { font-size: 0.85rem; color: #e53e3e; margin-top: 0.5rem; font-weight: 600; }
    .btn {
      display: inline-block; margin-top: 1rem; padding: 0.5rem 1.5rem;
      background: #25d366; color: white; border-radius: 999px;
      text-decoration: none; font-size: 0.85rem; font-weight: 600;
    }
  </style>
</head>
<body style="font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;">
  <div class="card">
    <div class="logo">📱</div>
    <h1>Hubungkan WhatsApp</h1>
    <div class="badge">Sesi: ${sessionId}</div>
    <div class="qr-wrapper">
      <img src="${qrImageUrl}" alt="QR Code WhatsApp" />
    </div>
    <ol class="steps">
      <li>Buka WhatsApp di ponsel Anda</li>
      <li>Ketuk <strong>⋮ Menu</strong> → <strong>Perangkat Tertaut</strong></li>
      <li>Ketuk <strong>Tautkan Perangkat</strong></li>
      <li>Arahkan kamera ke QR di atas</li>
    </ol>
    <p class="timer">⏳ QR kadaluarsa dalam <span id="countdown">60</span> detik</p>
    <a class="btn" href="/session/qr/${sessionId}">🔄 Refresh QR</a>
    <p class="note">Halaman akan otomatis refresh saat QR kadaluarsa</p>
  </div>
  <script>
    let seconds = 60;
    const el = document.getElementById('countdown');
    const timer = setInterval(() => {
      seconds--;
      el.textContent = seconds;
      if (seconds <= 0) { clearInterval(timer); window.location.reload(); }
    }, 1000);
    const pollStatus = setInterval(async () => {
      try {
        const res = await fetch('/session/status/${sessionId}');
        const data = await res.json();
        if (data.status === 'ready') {
          clearInterval(pollStatus);
          clearInterval(timer);
          document.querySelector('.card').innerHTML = \`
            <div style="font-size:3rem">✅</div>
            <h1 style="color:#16a34a;margin-top:0.5rem">Berhasil Terhubung!</h1>
            <p style="color:#555;margin-top:0.5rem">WhatsApp sesi <strong>${sessionId}</strong> sudah aktif.</p>
          \`;
        }
      } catch (_) {}
    }, 3000);
  </script>
</body>
</html>`;
