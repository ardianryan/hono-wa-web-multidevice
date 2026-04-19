import type { FC } from "hono/jsx";

export const LoginPage: FC<{
  appName: string;
  appDescription?: string;
  logoUrl?: string;
  error?: string;
  maintenance?: boolean;
}> = (props) => {
  return (
    <html
      lang="id"
      style='font-family: "Poppins", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;'
    >
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Login - {props.appName}</title>
        <meta
          name="description"
          content={
            props.appDescription ??
            "Kelola sesi WhatsApp, broadcast, dan status dengan kontrol akses pengguna."
          }
        />
        <meta property="og:title" content={`Login - ${props.appName}`} />
        <meta
          property="og:description"
          content={
            props.appDescription ??
            "Kelola sesi WhatsApp, broadcast, dan status dengan kontrol akses pengguna."
          }
        />
        {props.logoUrl ? <meta property="og:image" content={props.logoUrl} /> : null}
        <link
          rel="icon"
          href={
            props.logoUrl ??
            "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%233525cd'/%3E%3Ctext x='32' y='41' font-size='28' text-anchor='middle' fill='white'%3EWA%3C/text%3E%3C/svg%3E"
          }
        />
        <link
          rel="apple-touch-icon"
          href={
            props.logoUrl ??
            "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%233525cd'/%3E%3Ctext x='32' y='41' font-size='28' text-anchor='middle' fill='white'%3EWA%3C/text%3E%3C/svg%3E"
          }
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.bunny.net/css?family=poppins:300,400,500,600,700,800"
          rel="stylesheet"
        />
        <link
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.6.0/css/all.min.css"
          rel="stylesheet"
        />
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          :root {
            --app-font: "Poppins", ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
          }
          html, body {
            font-family: var(--app-font) !important;
            font-weight: 400;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            text-rendering: optimizeLegibility;
          }
          * { font-family: inherit; }
          body {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: radial-gradient(800px circle at 20% 20%, rgba(79,70,229,0.22), transparent 45%),
                        radial-gradient(800px circle at 80% 60%, rgba(93,253,138,0.18), transparent 50%),
                        #f9f9ff;
            padding: 2rem 1rem;
            color: #151c27;
          }
          input, button, select, textarea { font: inherit; }
          .toastRoot {
            position: fixed;
            top: 18px;
            right: 18px;
            z-index: 2000;
            display: flex;
            flex-direction: column;
            gap: 10px;
            width: min(360px, calc(100vw - 36px));
            pointer-events: none;
          }
          .toast {
            pointer-events: auto;
            background: #ffffff;
            border: 1px solid rgba(199,196,216,0.45);
            border-radius: 16px;
            padding: 12px 12px;
            box-shadow: 0 18px 52px rgba(15,23,42,0.16);
            display: flex;
            gap: 10px;
            align-items: flex-start;
            animation: toastIn 160ms ease-out;
          }
          .toastIcon {
            width: 28px;
            height: 28px;
            border-radius: 999px;
            display: grid;
            place-items: center;
            flex: 0 0 auto;
            border: 1px solid rgba(199,196,216,0.45);
            background: rgba(226,232,248,0.75);
            color: #3525cd;
          }
          .toast.error .toastIcon { background: rgba(186,26,26,0.08); color: #93000a; border-color: rgba(186,26,26,0.18); }
          .toast.success .toastIcon { background: rgba(34,197,94,0.12); color: #166534; border-color: rgba(34,197,94,0.22); }
          .toast.info .toastIcon { background: rgba(53,37,205,0.10); color: #3525cd; border-color: rgba(53,37,205,0.22); }
          .toastText { font-size: 13px; line-height: 1.45; color: rgba(17,24,39,0.9); }
          .toastClose {
            margin-left: auto;
            border: none;
            background: transparent;
            cursor: pointer;
            color: rgba(71,85,105,0.9);
            font-size: 14px;
            padding: 2px 6px;
            border-radius: 10px;
          }
          .toastClose:hover { background: rgba(79,70,229,0.06); color: #3525cd; }
          @keyframes toastIn {
            from { transform: translateY(-6px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
          .shell {
            width: 100%;
            max-width: 980px;
            background: rgba(255,255,255,0.75);
            border: 1px solid rgba(199,196,216,0.35);
            border-radius: 1.25rem;
            box-shadow: 0 24px 80px rgba(17,24,39,0.12);
            backdrop-filter: blur(16px);
            overflow: hidden;
          }
          .grid {
            display: grid;
            grid-template-columns: 1.15fr 0.85fr;
          }
          @media (max-width: 860px) {
            .grid { grid-template-columns: 1fr; }
            .left { display: none; }
          }
          .left {
            padding: 2.5rem 2.5rem;
            background:
              linear-gradient(135deg, rgba(79,70,229,0.15), rgba(79,70,229,0.05)),
              linear-gradient(180deg, #ffffff, #f0f3ff);
          }
          .brand {
            display: flex;
            align-items: center;
            gap: 0.85rem;
            margin-bottom: 1.75rem;
          }
          .logo {
            width: 44px;
            height: 44px;
            border-radius: 14px;
            background: #3525cd;
            box-shadow: 0 14px 30px rgba(53,37,205,0.22);
            display: grid;
            place-items: center;
            color: #fff;
            font-weight: 800;
            letter-spacing: -0.04em;
          }
          .logo.hasLogo {
            background: transparent;
            box-shadow: none;
          }
          .logoImg {
            width: 44px;
            height: 44px;
            border-radius: 14px;
            object-fit: cover;
            display: block;
          }
          .brand h1 {
            font-size: 1.1rem;
            font-weight: 800;
            letter-spacing: -0.03em;
            color: #3525cd;
            line-height: 1.1;
          }
          .brand p {
            font-size: 0.7rem;
            font-weight: 700;
            letter-spacing: 0.22em;
            text-transform: uppercase;
            color: rgba(70,69,85,0.7);
            margin-top: 0.15rem;
          }
          .headline {
            font-size: 2.4rem;
            font-weight: 800;
            letter-spacing: -0.045em;
            line-height: 1.05;
            margin-top: 0.75rem;
          }
          .subtitle {
            margin-top: 0.75rem;
            color: rgba(70,69,85,0.86);
            font-size: 0.98rem;
            line-height: 1.65;
            max-width: 26rem;
          }
          .pill {
            margin-top: 1.25rem;
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            font-size: 0.75rem;
            font-weight: 700;
            color: #0f0069;
            background: rgba(195,192,255,0.5);
            border: 1px solid rgba(195,192,255,0.9);
            border-radius: 999px;
            padding: 0.4rem 0.75rem;
          }
          .right {
            padding: 2.5rem 2.25rem;
            background: rgba(255,255,255,0.85);
          }
          .card {
            background: #fff;
            border: 1px solid rgba(199,196,216,0.35);
            border-radius: 1.25rem;
            padding: 1.75rem;
            box-shadow: 0 14px 36px rgba(17,24,39,0.08);
          }
          .card h2 {
            font-size: 1.2rem;
            font-weight: 800;
            letter-spacing: -0.02em;
          }
          .card p {
            margin-top: 0.35rem;
            font-size: 0.88rem;
            color: rgba(70,69,85,0.82);
            line-height: 1.6;
          }
          .alert {
            margin-top: 1rem;
            background: rgba(186,26,26,0.08);
            border: 1px solid rgba(186,26,26,0.18);
            color: #93000a;
            padding: 0.65rem 0.75rem;
            border-radius: 0.85rem;
            font-size: 0.85rem;
            font-weight: 650;
          }
          .field { margin-top: 1rem; }
          label { display: block; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(70,69,85,0.7); }
          input {
            width: 100%;
            margin-top: 0.45rem;
            padding: 0.85rem 0.9rem;
            border-radius: 0.9rem;
            border: 1px solid rgba(199,196,216,0.5);
            background: #ffffff;
            font-size: 0.95rem;
            outline: none;
          }
          input:focus { border-color: rgba(53,37,205,0.55); box-shadow: 0 0 0 4px rgba(53,37,205,0.12); }
          .actions { margin-top: 1.25rem; }
          .actions button,
          .actions input[type=submit] {
            width: 100%;
            display: block;
            border: none;
            cursor: pointer;
            padding: 0.9rem 1rem;
            border-radius: 0.95rem;
            font-weight: 800;
            font-size: 0.95rem;
            color: #fff;
            background: linear-gradient(90deg, #3525cd, #4f46e5);
            box-shadow: 0 18px 34px rgba(53,37,205,0.22);
            appearance: none;
            -webkit-appearance: none;
            transition: transform 120ms ease, filter 120ms ease, box-shadow 120ms ease;
          }
          .actions button:hover,
          .actions input[type=submit]:hover { filter: brightness(1.03); box-shadow: 0 20px 40px rgba(53,37,205,0.26); }
          .actions button:active,
          .actions input[type=submit]:active { transform: scale(0.99); }
          .toastClose { width: auto !important; min-width: 0 !important; box-shadow: none !important; }
          .hint {
            margin-top: 0.9rem;
            font-size: 0.78rem;
            color: rgba(70,69,85,0.7);
            line-height: 1.5;
          }
        `}</style>
      </head>
      <body style='font-family: "Poppins", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;'>
        <div id="toastRoot" class="toastRoot" aria-live="polite" aria-atomic="true" />
        <div class="shell">
          <div class="grid">
            <section class="left">
              <div class="brand">
                <div class={`logo${props.logoUrl ? " hasLogo" : ""}`}>
                  {props.logoUrl ? (
                    <img class="logoImg" src={props.logoUrl} alt={props.appName} />
                  ) : (
                    "WA"
                  )}
                </div>
                <div>
                  <h1>{props.appName}</h1>
                  <p>Login Dashboard</p>
                </div>
              </div>
              <div class="headline">Kelola sesi WhatsApp, broadcast, dan status.</div>
              <div class="subtitle">
                {props.appDescription ??
                  "Aplikasi backend WhatsApp multi-device dengan kontrol akses pengguna, pembatasan device, dan mode maintenance."}
              </div>
              <div class="pill">
                <span>●</span>
                <span>{props.maintenance ? "Maintenance" : "Ready"}</span>
              </div>
            </section>
            <section class="right">
              <div class="card">
                <h2>Login</h2>
                <p>Masuk untuk mengakses dashboard.</p>
                {props.error ? <div class="alert">{props.error}</div> : null}
                <form method="post" action="/login">
                  <div class="field">
                    <label for="username">Username</label>
                    <input id="username" name="username" type="text" required />
                  </div>
                  <div class="field">
                    <label for="password">Password</label>
                    <input id="password" name="password" type="password" required />
                  </div>
                  <div class="actions">
                    <button type="submit">Masuk</button>
                  </div>
                </form>
                <div class="hint">
                  Hubungi admin untuk mendapatkan akun login.
                </div>
              </div>
            </section>
          </div>
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `
(() => {
  const toastRoot = document.getElementById("toastRoot");
  const showToast = (message, type = "info") => {
    if (!toastRoot || !message) return;
    const toast = document.createElement("div");
    toast.className = "toast " + (type || "info");
    const icon = document.createElement("div");
    icon.className = "toastIcon";
    icon.innerHTML =
      type === "success"
        ? '<i class="fa-solid fa-check"></i>'
        : type === "error"
          ? '<i class="fa-solid fa-triangle-exclamation"></i>'
          : '<i class="fa-solid fa-circle-info"></i>';
    const text = document.createElement("div");
    text.className = "toastText";
    text.textContent = String(message);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "toastClose";
    close.textContent = "×";
    close.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toast.remove();
    });
    toast.addEventListener("click", () => toast.remove());
    toast.appendChild(icon);
    toast.appendChild(text);
    toast.appendChild(close);
    toastRoot.appendChild(toast);
    setTimeout(() => toast.remove(), 3800);
  };

  try {
    const params = new URLSearchParams(window.location.search);
    const msg = params.get("toast");
    const type = params.get("toastType") || "info";
    if (msg) {
      showToast(msg, type);
      params.delete("toast");
      params.delete("toastType");
      const newUrl =
        window.location.pathname +
        (params.toString() ? "?" + params.toString() : "") +
        window.location.hash;
      window.history.replaceState({}, "", newUrl);
    }
  } catch (_) {}

  const alertEl = document.querySelector(".alert");
  if (alertEl && alertEl.textContent) showToast(alertEl.textContent.trim(), "error");
})();
            `,
          }}
        />
      </body>
    </html>
  );
};
