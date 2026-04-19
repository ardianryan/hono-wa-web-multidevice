import type { FC } from "hono/jsx";

export type AdminNavKey =
  | "dashboard"
  | "sessions"
  | "message"
  | "broadcast"
  | "status"
  | "users"
  | "settings"
  | "apiDocs"
  | "profile";

const baseCss = `
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
    background: #f9f9ff;
    color: #151c27;
  }
  button, input, select, textarea { font: inherit; }
  a { color: inherit; text-decoration: none; }
  .app { min-height: 100vh; display: flex; }
  .sidebar {
    width: 260px;
    padding: 16px;
    background: #f8fafc;
    border-right: 1px solid rgba(199,196,216,0.35);
    display: none;
  }
  @media (min-width: 1024px) { .sidebar { display: flex; flex-direction: column; position: sticky; top: 0; height: 100vh; } }
  .brand { display:flex; align-items:center; gap: 12px; padding: 12px 8px; margin-bottom: 10px; }
  .brandIcon {
    width: 40px; height: 40px; border-radius: 14px;
    background: #3525cd; display:grid; place-items:center; color:#fff;
    box-shadow: 0 14px 30px rgba(53,37,205,0.18);
    overflow: hidden;
  }
  .brandIcon.hasLogo {
    background: #fff;
    box-shadow: none;
    border: 1px solid rgba(199,196,216,0.35);
  }
  .brandLogo { width: 40px; height: 40px; object-fit: cover; display: block; }
  .brandTitle { font-weight: 800; letter-spacing: -0.03em; color: #3525cd; line-height: 1.1; }
  .brandSub { margin-top: 2px; font-size: 10px; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(70,69,85,0.6); }
  .nav { display:flex; flex-direction: column; gap: 4px; padding-top: 8px; }
  .navItem {
    display:flex; align-items:center; gap: 10px;
    padding: 10px 12px; border-radius: 12px;
    font-weight: 600; font-size: 14px;
    color: rgba(71,85,105,0.95);
  }
  .navItem:hover { background: rgba(79,70,229,0.06); color: #3525cd; }
  .navItem.active { background: #ffffff; color: #3525cd; box-shadow: 0 8px 22px rgba(15,23,42,0.06); border: 1px solid rgba(199,196,216,0.35); }
  .navIcon {
    width: 20px;
    text-align: center;
    font-size: 16px;
    color: currentColor;
    opacity: 0.9;
  }
  .sideBottom { margin-top: auto; padding-top: 14px; border-top: 1px solid rgba(199,196,216,0.35); display:flex; flex-direction:column; gap: 6px; }
  .navItem.logoutNav {
    background: rgba(186,26,26,0.08);
    border: 1px solid rgba(186,26,26,0.18);
    color: #93000a;
  }
  .navItem.logoutNav:hover { background: rgba(186,26,26,0.12); color: #93000a; }
  .newBtn {
    margin: 10px 6px 8px;
    border: none; cursor: pointer;
    padding: 12px 14px;
    border-radius: 14px;
    font-weight: 800; font-size: 13px;
    color: #fff;
    background: linear-gradient(90deg, #3525cd, #4f46e5);
    box-shadow: 0 18px 34px rgba(53,37,205,0.18);
  }
  .content { flex: 1; min-width: 0; }
  .topbar {
    position: sticky; top: 0; z-index: 40;
    backdrop-filter: blur(12px);
    background: rgba(255,255,255,0.8);
    border-bottom: 1px solid rgba(199,196,216,0.35);
    display:flex; align-items:center; justify-content: space-between;
    padding: 12px 18px;
  }
  .topTitle { font-weight: 800; letter-spacing: -0.02em; color: #3525cd; }
  .topRight { display:flex; align-items:center; gap: 12px; }
  .chip {
    font-size: 12px; font-weight: 650;
    color: rgba(70,69,85,0.82);
    background: rgba(226,232,248,0.75);
    border: 1px solid rgba(199,196,216,0.35);
    padding: 6px 10px;
    border-radius: 999px;
  }
  .logoutBtn {
    border: 1px solid rgba(199,196,216,0.45);
    background: #fff;
    border-radius: 999px;
    padding: 8px 12px;
    font-weight: 650;
    cursor: pointer;
  }
  .accountBtn {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    border: 1px solid rgba(199,196,216,0.45);
    background: #fff;
    border-radius: 999px;
    padding: 6px 10px 6px 6px;
    cursor: pointer;
  }
  .avatar {
    width: 28px;
    height: 28px;
    border-radius: 999px;
    object-fit: cover;
    display: block;
    background: rgba(226,232,248,0.75);
    border: 1px solid rgba(199,196,216,0.35);
  }
  .accountName { font-size: 13px; font-weight: 650; color: rgba(17,24,39,0.88); }
  .accountMenuWrap { position: relative; }
  .accountMenu {
    position: absolute;
    right: 0;
    top: calc(100% + 10px);
    width: 240px;
    background: #fff;
    border: 1px solid rgba(199,196,216,0.35);
    border-radius: 16px;
    box-shadow: 0 18px 52px rgba(15,23,42,0.18);
    padding: 8px;
    display: none;
    z-index: 60;
  }
  .accountMenu.show { display: block; }
  .menuHeader {
    padding: 10px 10px 8px;
    border-bottom: 1px solid rgba(199,196,216,0.35);
    margin-bottom: 8px;
  }
  .menuTitle { font-weight: 800; letter-spacing: -0.02em; }
  .menuSub { margin-top: 2px; font-size: 12px; color: rgba(70,69,85,0.75); }
  .menuItem {
    width: 100%;
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 10px 10px;
    border-radius: 12px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-weight: 650;
    font-size: 14px;
    color: rgba(71,85,105,0.98);
    text-decoration: none;
  }
  .menuItem:hover { background: rgba(79,70,229,0.06); color: #3525cd; }
  .menuItem.danger { color: #93000a; }
  .menuItem.danger:hover { background: rgba(186,26,26,0.08); color: #93000a; }
  .wrap { padding: 22px; max-width: 1200px; margin: 0 auto; }
  .pageTitle { font-size: 30px; font-weight: 800; letter-spacing: -0.04em; }
  .pageSub { margin-top: 6px; color: rgba(70,69,85,0.75); font-weight: 500; font-size: 13px; }
  .grid { margin-top: 18px; display:grid; grid-template-columns: repeat(12, 1fr); gap: 14px; }
  .card {
    background: #fff;
    border: 1px solid rgba(199,196,216,0.35);
    border-radius: 16px;
    padding: 16px;
    box-shadow: 0 14px 36px rgba(17,24,39,0.06);
  }
  .statLabel { font-size: 10px; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(70,69,85,0.55); }
  .statValue { margin-top: 10px; font-size: 28px; font-weight: 800; letter-spacing: -0.03em; }
  .table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  .table th {
    text-align: left;
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(70,69,85,0.55);
    padding: 10px 10px;
    border-bottom: 1px solid rgba(199,196,216,0.35);
  }
  .table td { padding: 10px 10px; border-bottom: 1px solid rgba(199,196,216,0.25); font-size: 14px; }
  .muted { color: rgba(70,69,85,0.75); }
  .btn {
    display:inline-block;
    border: 1px solid rgba(199,196,216,0.45);
    background: #fff;
    border-radius: 12px;
    padding: 9px 12px;
    font-weight: 650;
    font-size: 13px;
    cursor: pointer;
  }
  .btn.primary {
    border: none;
    color: #fff;
    background: linear-gradient(90deg, #3525cd, #4f46e5);
    box-shadow: 0 18px 34px rgba(53,37,205,0.16);
  }
  .btn.danger { border: 1px solid rgba(186,26,26,0.25); color: #93000a; background: rgba(186,26,26,0.06); }
  .btn.danger:hover { background: rgba(186,26,26,0.10); }
  .btnRow { display:flex; gap: 10px; flex-wrap: wrap; }
  .formRow { display:grid; grid-template-columns: 1fr; gap: 6px; margin-top: 12px; }
  .label { font-size: 11px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(70,69,85,0.55); }
  .input, .select, .textarea {
    width: 100%;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid rgba(199,196,216,0.5);
    background: #fff;
    outline: none;
    font-size: 14px;
  }
  .textarea { min-height: 120px; resize: vertical; }
  .input:focus, .select:focus, .textarea:focus { border-color: rgba(53,37,205,0.55); box-shadow: 0 0 0 4px rgba(53,37,205,0.12); }
  .alert {
    margin-top: 12px;
    padding: 10px 12px;
    border-radius: 14px;
    background: rgba(186,26,26,0.08);
    border: 1px solid rgba(186,26,26,0.18);
    color: #93000a;
    font-weight: 650;
    font-size: 13px;
  }
  .modalBackdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.55);
    backdrop-filter: blur(3px);
    display: none;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 18px;
  }
  .modalBackdrop.show { display: flex; }
  .modalCard {
    width: 100%;
    max-width: 460px;
    background: #fff;
    border: 1px solid rgba(199,196,216,0.35);
    border-radius: 20px;
    padding: 16px 16px 14px;
    box-shadow: 0 30px 80px rgba(15,23,42,0.35);
  }
  .modalHead {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }
  .modalTitle { font-size: 17px; font-weight: 800; letter-spacing: -0.02em; }
  .modalClose {
    border: 1px solid rgba(199,196,216,0.45);
    background: #fff;
    border-radius: 10px;
    width: 34px;
    height: 34px;
    cursor: pointer;
  }
  .qrPane {
    border: 2px dashed rgba(53,37,205,0.26);
    border-radius: 16px;
    min-height: 320px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 10px;
    background: linear-gradient(180deg, #fafbff, #f7f8ff);
    text-align: center;
    padding: 14px;
  }
  .qrImageWrap {
    border: 3px solid #25d366;
    border-radius: 16px;
    padding: 10px;
    background: #fff;
  }
  .qrHint {
    font-size: 12px;
    color: rgba(70,69,85,0.8);
    line-height: 1.5;
    font-weight: 500;
  }
  .toggleRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    user-select: none;
  }
  .toggle input { display: none; }
  .toggleTrack {
    width: 46px;
    height: 28px;
    border-radius: 999px;
    background: rgba(100,116,139,0.25);
    border: 1px solid rgba(199,196,216,0.55);
    position: relative;
    transition: background 120ms ease, border-color 120ms ease;
  }
  .toggleThumb {
    width: 22px;
    height: 22px;
    border-radius: 999px;
    background: #fff;
    position: absolute;
    top: 2px;
    left: 2px;
    box-shadow: 0 10px 18px rgba(15,23,42,0.18);
    transition: transform 120ms ease;
  }
  .toggle input:checked + .toggleTrack {
    background: rgba(53,37,205,0.85);
    border-color: rgba(53,37,205,0.65);
  }
  .toggle input:checked + .toggleTrack .toggleThumb {
    transform: translateX(18px);
  }
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
  .spinner {
    width: 24px;
    height: 24px;
    border-radius: 999px;
    border: 3px solid rgba(79,70,229,0.2);
    border-top-color: #4f46e5;
    animation: spin 1s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
`;

const NavItem: FC<{
  href: string;
  label: string;
  icon: string;
  active?: boolean;
}> = (props) => (
  <a class={`navItem${props.active ? " active" : ""}`} href={props.href}>
    <i class={`navIcon ${props.icon}`} aria-hidden="true" />
    <span>{props.label}</span>
  </a>
);

export const AdminLayout: FC<{
  appName: string;
  username: string;
  appDescription?: string;
  logoUrl?: string;
  avatarUrl?: string;
  active: AdminNavKey;
  children?: any;
}> = (props) => (
  <html
    lang="id"
    style='font-family: "Poppins", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;'
  >
    <head>
      <meta charSet="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>{props.appName}</title>
      <meta
        name="description"
        content={
          props.appDescription ??
          "Kelola sesi WhatsApp, broadcast, dan status dengan kontrol akses pengguna."
        }
      />
      <meta property="og:title" content={props.appName} />
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
      <style>{baseCss}</style>
    </head>
    <body style='font-family: "Poppins", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;'>
      <div class="app">
        <aside class="sidebar">
          <div class="brand">
            <div class={`brandIcon${props.logoUrl ? " hasLogo" : ""}`}>
              {props.logoUrl ? (
                <img class="brandLogo" src={props.logoUrl} alt={props.appName} />
              ) : (
                <i class="fa-solid fa-message navIcon" aria-hidden="true" />
              )}
            </div>
            <div>
              <div class="brandTitle">{props.appName}</div>
              <div class="brandSub">Admin Console</div>
            </div>
          </div>

          <nav class="nav">
            <NavItem
              href="/admin"
              label="Dashboard"
              icon="fa-solid fa-gauge-high"
              active={props.active === "dashboard"}
            />
            <NavItem
              href="/admin/sessions"
              label="Session Pengguna WA"
              icon="fa-solid fa-mobile-screen"
              active={props.active === "sessions"}
            />
            <NavItem
              href="/admin/message"
              label="Message"
              icon="fa-solid fa-comment-dots"
              active={props.active === "message"}
            />
            <NavItem
              href="/admin/broadcast"
              label="Broadcast"
              icon="fa-solid fa-bullhorn"
              active={props.active === "broadcast"}
            />
            <NavItem
              href="/admin/status"
              label="Status"
              icon="fa-solid fa-circle-check"
              active={props.active === "status"}
            />
            <NavItem
              href="/admin/users"
              label="Manajemen User"
              icon="fa-solid fa-users"
              active={props.active === "users"}
            />
            <NavItem
              href="/admin/settings"
              label="Pengaturan"
              icon="fa-solid fa-sliders"
              active={props.active === "settings"}
            />
            <NavItem
              href="/admin/api-docs"
              label="API Docs"
              icon="fa-solid fa-book"
              active={props.active === "apiDocs"}
            />
          </nav>

          <button class="newBtn" onclick="window.location.href='/admin/sessions'">
            New Session
          </button>

          <div class="sideBottom">
            <a class="navItem" href="/admin/help">
              <i class="fa-solid fa-circle-question navIcon" aria-hidden="true" />
              <span>Help</span>
            </a>
          </div>
        </aside>

        <div class="content">
          <header class="topbar">
            <div class="topTitle">{props.appName}</div>
            <div class="topRight">
              <div class="accountMenuWrap">
                <button class="accountBtn" type="button" id="accountBtn">
                  <img
                    class="avatar"
                    src={
                      props.avatarUrl ??
                      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='32' fill='%23e2e8f0'/%3E%3Cpath d='M32 34c6.1 0 11-4.9 11-11S38.1 12 32 12s-11 4.9-11 11 4.9 11 11 11zm0 6c-9.9 0-18 5.4-18 12v4h36v-4c0-6.6-8.1-12-18-12z' fill='%2364758b'/%3E%3C/svg%3E"
                    }
                    alt={props.username}
                  />
                  <span class="accountName">{props.username}</span>
                  <i class="fa-solid fa-chevron-down navIcon" aria-hidden="true" />
                </button>
                <div class="accountMenu" id="accountMenu">
                  <div class="menuHeader">
                    <div class="menuTitle">{props.username}</div>
                    <div class="menuSub">Pengaturan akun</div>
                  </div>
                  <a class="menuItem" href="/admin/profile">
                    <i class="fa-solid fa-user" aria-hidden="true" />
                    <span>Profil</span>
                  </a>
                  <form method="post" action="/logout">
                    <button class="menuItem danger" type="submit">
                      <i class="fa-solid fa-right-from-bracket" aria-hidden="true" />
                      <span>Logout</span>
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </header>

          <main class="wrap">{props.children}</main>
        </div>
      </div>
      <div id="toastRoot" class="toastRoot" aria-live="polite" aria-atomic="true" />
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

  window.__showToast = showToast;

  const btn = document.getElementById("accountBtn");
  const menu = document.getElementById("accountMenu");
  if (btn && menu) {
    const closeMenu = () => menu.classList.remove("show");
    const toggleMenu = () => menu.classList.toggle("show");

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleMenu();
    });

    document.addEventListener("click", (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (btn.contains(t) || menu.contains(t)) return;
      closeMenu();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu();
    });
  }

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
  if (alertEl && alertEl.textContent) {
    const type =
      alertEl.classList.contains("success")
        ? "success"
        : alertEl.classList.contains("info")
          ? "info"
          : "error";
    showToast(alertEl.textContent.trim(), type);
  }
})();
          `,
        }}
      />
    </body>
  </html>
);

export const PageHeader: FC<{ title: string; subtitle: string; actions?: any }> = (
  props,
) => (
  <div>
    <div style="display:flex; gap: 14px; align-items: flex-end; justify-content: space-between; flex-wrap: wrap;">
      <div>
        <div class="pageTitle">{props.title}</div>
        <div class="pageSub">{props.subtitle}</div>
      </div>
      {props.actions ? <div class="btnRow">{props.actions}</div> : null}
    </div>
  </div>
);

export const StatCard: FC<{ label: string; value: string; colSpan: number }> = (
  props,
) => (
  <div class="card" style={`grid-column: span ${props.colSpan}; position: relative; overflow: hidden;`}>
    <div class="statLabel">{props.label}</div>
    <div class="statValue">{props.value}</div>
  </div>
);
