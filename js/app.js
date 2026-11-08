// رابط کاربری: مسیریابی، صفحه‌های هر نقش و افزودن گروهی شاگرد
"use strict";

(() => {
  const $app = document.getElementById("app");
  const esc = U.esc, fa = U.faNum;
  let me = null;

  const ROLE_TITLE = { manager: "مدیر", advisor: "مشاور", supporter: "پشتیبان", student: "شاگرد", parent: "ولی" };
  const DEMO_ACCOUNTS = [
    ["admin", "مدیر (دکتر خاکسار)"], ["zilabi", "مشاور"], ["rezaei", "پشتیبان"], ["s1003", "شاگرد"], ["p1003", "ولی"], ["ahmadi", "مشاور ۲"],
  ];

  // ---------- ابزارهای رابط ----------
  let toastTimer = null;
  function toast(text, isError = false) {
    const el = document.getElementById("toast");
    el.textContent = text;
    el.className = "show" + (isError ? " error" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.className = ""), 2800);
  }
  async function run(fn, okText) {
    try {
      const out = await fn();
      if (okText) toast(okText);
      return out;
    } catch (e) {
      toast(e.message || "خطا", true);
      throw e;
    }
  }
  const qs = (sel, root = $app) => root.querySelector(sel);
  const qsa = (sel, root = $app) => [...root.querySelectorAll(sel)];
  function on(sel, evt, fn, root = $app) { qsa(sel, root).forEach((el) => el.addEventListener(evt, fn)); }

  function modal({ title, body, okText = "تأیید", cancelText = "انصراف", danger = false, onOk }) {
    return new Promise((resolve) => {
      const back = document.createElement("div");
      back.className = "modal-back";
      back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
        <h2>${esc(title)}</h2><div class="modal-body">${body}</div>
        <div class="actions">${cancelText ? `<button class="btn" data-x="cancel">${esc(cancelText)}</button>` : ""}
        <button class="btn ${danger ? "danger" : "primary"}" data-x="ok">${esc(okText)}</button></div></div>`;
      document.body.appendChild(back);
      const close = (v) => { back.remove(); resolve(v); };
      back.addEventListener("click", (e) => { if (e.target === back) close(null); });
      back.querySelector('[data-x="cancel"]')?.addEventListener("click", () => close(null));
      back.querySelector('[data-x="ok"]').addEventListener("click", async () => {
        try { close(onOk ? await onOk(back) : true); } catch (e) { toast(e.message, true); }
      });
      const first = back.querySelector("textarea, input, select");
      (first || back.querySelector('[data-x="ok"]')).focus();
    });
  }
  const confirmBox = (title, text, okText = "بله", danger = true) =>
    modal({ title, body: `<p>${esc(text)}</p>`, okText, danger });
  function textBox(title, hint, okText, sendFn) {
    return modal({
      title, okText,
      body: `<p class="muted small">${esc(hint)}</p><textarea class="input" style="min-height:130px" placeholder="متن را بنویسید..."></textarea>`,
      onOk: async (root) => { await sendFn(root.querySelector("textarea").value); return true; },
    });
  }

  // نمایش و دانلود اطلاعات ورود (فقط همین یک بار نمایش داده می‌شود)
  function credsRows(list) {
    return list.map((c) => [c.name, c.username, c.password, c.parentUsername, c.parentPassword, c.phone, c.parentPhone, c.supporterName || ""]);
  }
  function downloadCreds(list, file = "اطلاعات-ورود-شاگردان.csv") {
    U.download(file, U.toCsv([["نام", "نام کاربری شاگرد", "رمز شاگرد", "نام کاربری ولی", "رمز ولی", "موبایل شاگرد", "موبایل ولی", "پشتیبان"], ...credsRows(list)]));
  }
  function credsCards(list) {
    const url = location.href.split("#")[0];
    return `<div class="print-only"><h2 style="margin-bottom:8px">اطلاعات ورود — ${esc(Store.INSTITUTE)}</h2>
      <p class="small">آدرس ورود: <span class="ltr">${esc(url)}</span></p><div class="cred-grid">
      ${list.map((c) => `<div class="cred-card"><b>${esc(c.name)}</b><br>
        شاگرد: <span class="ltr">${esc(c.username)}</span> / رمز: <span class="ltr">${esc(c.password)}</span><br>
        ${c.parentUsername ? `ولی: <span class="ltr">${esc(c.parentUsername)}</span> / رمز: <span class="ltr">${esc(c.parentPassword)}</span>` : ""}
      </div>`).join("")}</div></div>`;
  }

  // ---------- قطعات مشترک ----------
  function statusBadge(r) {
    if (!r) return `<span class="badge gray">بدون گزارش</span>`;
    if (r.doneHours == null) return `<span class="badge amber">فقط هدف صبح</span>`;
    const met = r.doneHours >= r.targetHours;
    return `<span class="badge ${met ? "green" : "red"}">${met ? "✓" : "✗"} ${fa(r.doneHours)} از ${fa(r.targetHours)} ساعت</span>`;
  }
  const warnSleep = (v, L) => v != null && (v < L.SLEEP_MIN || v > L.SLEEP_MAX);
  const warnPhone = (v, L) => v != null && v > L.PHONE_WARN;
  const LIMITS = { SLEEP_MIN: 6, SLEEP_MAX: 9, PHONE_WARN: 2 };

  function weekHtml(w) {
    const pct = w.targetHours ? Math.round((w.totalHours / w.targetHours) * 100) : null;
    const max = Math.max(1, ...w.days.map((d) => Math.max(d.report?.doneHours || 0, d.report?.targetHours || 0)));
    const L = w.limits;
    const cols = w.days.map((d) => {
      const r = d.report, done = r?.doneHours;
      const label = U.weekdayShort(d.day);
      if (done == null) {
        return `<div class="week-col"><div class="bar-area"><div class="bar no-report"></div></div><div class="day">${esc(label)}</div></div>`;
      }
      const h = (done / max) * 100, t = r.targetHours != null ? (r.targetHours / max) * 100 : null;
      const met = r.targetHours != null && done >= r.targetHours;
      return `<div class="week-col"><div class="bar-area">
          <div class="bar ${met ? "met" : ""}" style="height:${h}%"></div>
          ${t != null ? `<div class="target" style="bottom:${t}%"></div>` : ""}
          <div class="val" style="bottom:calc(${Math.max(h, t || 0)}% + 4px)">${fa(done)}</div>
        </div><div class="day">${esc(label)}</div></div>`;
    }).join("");
    const tile = (label, value, unit, warn) =>
      `<div class="card stat"><div class="label">${label}</div><div class="value" style="${warn ? "color:var(--rose)" : ""}">${value}<small>${unit}</small></div></div>`;
    return `
      <div class="week-top">
        <div class="ring" style="--p:${Math.min(pct ?? 0, 100)};--ring-color:${pct >= 100 ? "var(--teal)" : "var(--primary)"}">
          <div><div><b>${pct == null ? "–" : fa(pct) + "٪"}</b><span>تحقق هدف مطالعه</span></div></div></div>
        <div class="tiles">
          ${tile("مجموع مطالعه", fa(w.totalHours), `از ${fa(w.targetHours)} ساعت`)}
          ${tile("تست‌ها", fa(w.totalTests), "تست")}
          ${tile("روزهای فعال", fa(w.activeDays), "از ۷ روز")}
          ${tile("میانگین خواب", fa(w.avgSleep), "ساعت", warnSleep(w.avgSleep, L))}
          ${tile("میانگین موبایل", fa(w.avgPhone), "ساعت", warnPhone(w.avgPhone, L))}
          ${tile("کلاس کنکور", fa(w.totalClass), "ساعت")}
        </div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-head"><h3>ساعت مطالعه روزانه</h3>
          <div class="legend"><span><i style="background:var(--teal)"></i>به هدف رسید</span><span><i style="background:var(--primary)"></i>نرسید</span><span><i style="background:var(--amber)"></i>هدف روز</span></div></div>
        <div class="week-chart">${cols}</div>
      </div>`;
  }

  function historyHtml(days) {
    return `<div class="list">${days.map((d) => {
      const r = d.report;
      const title = `<b>${esc(U.weekday(d.day))}</b><div class="muted small">${esc(U.faDate(d.day))}</div>`;
      if (!r) return `<div class="day-row"><div>${title}</div><div><span class="badge gray">هیچ گزارشی ثبت نشده</span></div></div>`;
      const morning = `هدف: <b>${fa(r.targetHours)}</b> ساعت، <b>${fa(r.targetTests)}</b> تست | خواب: <b style="${warnSleep(r.sleep, LIMITS) ? "color:var(--rose)" : ""}">${fa(r.sleep)}</b>`;
      const night = r.doneHours == null ? `<span class="badge amber">گزارش شب ندارد</span>` :
        `<div class="kv"><span>مطالعه: <b>${fa(r.doneHours)}</b></span><span>تست: <b>${fa(r.doneTests)}</b></span>
         <span>کلاس: <b>${fa(r.classHours)}</b></span><span>موبایل: <b style="${warnPhone(r.phoneHours, LIMITS) ? "color:var(--rose)" : ""}">${fa(r.phoneHours)}</b></span>
         ${d.tasksTotal ? `<span>چک‌لیست: <b>${fa(d.tasksDone)} از ${fa(d.tasksTotal)}</b></span>` : ""}</div>`;
      return `<div class="day-row"><div>${title}</div><div><div class="row" style="margin-bottom:4px">${statusBadge(r)}<span class="muted small">${morning}</span></div>${night}</div></div>`;
    }).join("")}</div>`;
  }

  function feedbackListHtml(items, showTarget) {
    if (!items.length) return `<div class="empty">هنوز بازخوردی ثبت نشده.</div>`;
    return `<div class="list">${items.map((f) => `
      <div class="list-item"><div class="grow">
        <div class="row"><b>${esc(f.fromName)}</b><span class="badge gray">${esc(ROLE_TITLE[f.fromRole] || "")}</span>
          ${showTarget ? `<span class="badge ${f.target === "advisor" ? "indigo" : "green"}">${f.target === "advisor" ? "به مشاور" : "به شاگرد"}</span>` : ""}
          <span class="spacer"></span><span class="muted small">${esc(U.faDateTime(f.createdAt))}</span></div>
        <div class="msg-text">${esc(f.text)}</div></div></div>`).join("")}</div>`;
  }

  // بازخورد خودکار بعد از گزارش شب (مثل ربات)
  function nightFeedback(r) {
    const lines = [];
    if (r.doneHours > r.targetHours) lines.push(`⏱ مطالعه: ${fa(r.doneHours)} ساعت — ${fa(r.doneHours - r.targetHours)} ساعت بیشتر از هدفت! 🔥`);
    else if (r.doneHours === r.targetHours) lines.push(`⏱ مطالعه: ${fa(r.doneHours)} ساعت — دقیقاً مطابق هدف 🎯`);
    else lines.push(`⏱ مطالعه: ${fa(r.doneHours)} از ${fa(r.targetHours)} ساعت (${fa(r.targetHours ? Math.floor((r.doneHours / r.targetHours) * 100) : 0)}٪)`);
    if (r.doneTests >= r.targetTests) lines.push(`📝 تست: ${fa(r.doneTests)} — هدف تست کامل شد 🚀`);
    else lines.push(`📝 تست: ${fa(r.doneTests)} از ${fa(r.targetTests)}`);
    if (r.sleep != null) lines.push(`😴 خواب دیشب: ${fa(r.sleep)} ساعت${warnSleep(r.sleep, LIMITS) ? " — ⚠️ خارج از محدوده ۶ تا ۹ ساعت" : ""}`);
    if (r.phoneHours != null) lines.push(`📱 موبایل غیردرسی: ${fa(r.phoneHours)} ساعت${warnPhone(r.phoneHours, LIMITS) ? " — ⚠️ بیشتر از ۲ ساعت؛ کمش کن" : ""}`);
    const both = r.doneHours >= r.targetHours && r.doneTests >= r.targetTests;
    const one = r.doneHours >= r.targetHours || r.doneTests >= r.targetTests;
    const cheer = both ? "🌟 شاهکار کردی! عملکردت در حد رتبه‌های برتر بود." : one ? "👏 آفرین، گام محکمی برداشتی! خسته نباشی." : "🌱 خسته نباشی قهرمان! استمرار رمز موفقیته؛ فردا پرقدرت‌تر شروع کن.";
    return { lines, cheer, ok: both };
  }

  // ---------- چیدمان صفحه ----------
  function navItems() {
    switch (me.role) {
      case "manager":
      case "advisor":
        return [["dashboard", "🏠", "داشبورد"], ["students", "🎓", "شاگردان"], ["import", "➕", "افزودن گروهی"],
          ["staff", "🧑‍💼", me.role === "manager" ? "مشاوران و پشتیبان‌ها" : "پشتیبان‌ها"], ["inbox", "📝", "گزارش پشتیبان‌ها"]];
      case "supporter":
        return [["dashboard", "🏠", "داشبورد"], ["students", "🎓", "شاگردان من"]];
      case "student":
        return [["today", "☀️", "امروز"], ["week", "📊", "کارنامه هفتگی"], ["messages", "💬", "بازخوردها"]];
      default:
        return [["child", "👪", "فرزند من"]];
    }
  }
  async function layout(active, content, badges = {}) {
    const items = navItems();
    const link = (key, ic, label, cls) =>
      `<a href="#/${key}" class="${key === active ? "active" : ""}">${cls === "bottom" ? `<span class="ic">${ic}</span>` : ic} ${label}${badges[key] ? ` <span class="badge red">${fa(badges[key])}</span>` : ""}</a>`;
    $app.innerHTML = `
      <div class="demo-bar no-print">نسخه نمایشی — داده‌ها فقط در همین مرورگر ذخیره می‌شوند.
        <button data-reset>بازنشانی داده‌های نمونه</button></div>
      <div class="shell">
        <aside class="sidebar no-print">
          <div class="brand"><div class="brand-mark">خ</div><div><b>پنل پیگیری درسی</b><span>${esc(Store.INSTITUTE)}</span></div></div>
          <nav class="nav">${items.map(([k, ic, l]) => link(k, ic, l)).join("")}</nav>
          <div class="me"><b>${esc(me.name)}</b><div class="muted">${esc(ROLE_TITLE[me.role])} · <span dir="ltr">${esc(me.username)}</span></div>
            <button class="btn sm" style="margin-top:8px;width:100%" data-logout>خروج</button></div>
        </aside>
        <main class="main">${content}</main>
      </div>
      <nav class="bottom-nav no-print">${items.map(([k, ic, l]) => link(k, ic, l, "bottom")).join("")}
        <a href="#" data-logout><span class="ic">↩</span> خروج</a></nav>`;
    on("[data-logout]", "click", async (e) => { e.preventDefault(); await Store.logout(); location.hash = "#/login"; render(); });
    on("[data-reset]", "click", async () => {
      if (await confirmBox("بازنشانی", "همه تغییرات این مرورگر پاک و داده‌های نمونه دوباره ساخته می‌شود.", "بازنشانی")) {
        await Store.resetDemo(); location.hash = "#/login"; render();
      }
    });
  }
  const pageHead = (title, sub, actions = "") =>
    `<div class="page-head"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ""}</div><div class="row no-print">${actions}</div></div>`;

  // ---------- ورود ----------
  function loginView() {
    $app.innerHTML = `
      <div class="login-wrap"><div class="card login-card">
        <div class="brand"><div class="brand-mark">خ</div><div><b>پنل پیگیری درسی</b><span>${esc(Store.INSTITUTE)}</span></div></div>
        <form class="stack" id="login-form" autocomplete="on">
          <div class="field"><label for="u">نام کاربری</label><input class="input ltr" id="u" autocomplete="username" required></div>
          <div class="field"><label for="p">رمز عبور</label><input class="input ltr" id="p" type="password" autocomplete="current-password" required></div>
          <button class="btn primary" type="submit">ورود</button>
        </form>
        <div class="alert warn small" style="margin-top:16px">نسخه نمایشی: حساب‌های نمونه (رمز همه <b dir="ltr">1234</b>) — روی هر کدام بزنید:
          <div class="demo-accounts">${DEMO_ACCOUNTS.map(([u, l]) => `<button type="button" data-demo="${u}">${l}<small>${u}</small></button>`).join("")}</div>
        </div>
      </div></div>`;
    const submit = async (u, p) => {
      await run(() => Store.login(u, p));
      location.hash = "#/";
      render();
    };
    qs("#login-form").addEventListener("submit", (e) => { e.preventDefault(); submit(qs("#u").value, qs("#p").value).catch(() => {}); });
    on("[data-demo]", "click", (e) => submit(e.currentTarget.dataset.demo, "1234").catch(() => {}));
  }

  // ---------- داشبورد کادر ----------
  async function dashboardView() {
    const o = await Store.overview();
    const reported = o.met + o.missed;
    const pct = o.total ? Math.round((reported / o.total) * 100) : 0;
    const stat = (label, value, sub, bar) => `<div class="card stat"><div class="label">${label}</div>
      <div class="value">${value}${sub ? `<small>${sub}</small>` : ""}</div>${bar != null ? `<div class="bar"><span style="width:${bar}%"></span></div>` : ""}</div>`;
    const missing = o.missing.slice(0, 12);
    await layout("dashboard", `
      ${pageHead(`سلام ${esc(me.name)} 👋`, `${esc(U.weekday(U.studyDay()))} ${esc(U.faDate(U.studyDay(), { day: "numeric", month: "long", year: "numeric" }))}`)}
      ${o.unread ? `<a class="alert info" style="display:block;margin-bottom:16px" href="#/inbox">📝 ${fa(o.unread)} گزارش خوانده‌نشده از پشتیبان‌ها دارید.</a>` : ""}
      <div class="grid cols-4">
        ${stat("شاگردان", fa(o.total), "نفر")}
        ${stat("گزارش شب امروز", fa(reported), `از ${fa(o.total)}`, pct)}
        ${stat("به هدف مطالعه رسیدند", fa(o.met), "نفر")}
        ${stat("گزارش شب ندارند", fa(o.none + o.goalOnly), "نفر")}
      </div>
      <div class="grid cols-2" style="margin-top:16px">
        <div class="card"><div class="card-head"><h2>هنوز گزارش شب نداده‌اند</h2><a href="#/students?status=pending" class="small">همه</a></div>
          ${missing.length ? `<div class="list">${missing.map((s) => `<a class="list-item" href="#/student/${s.id}" style="color:inherit">
            <div class="grow"><b>${esc(s.name)}</b><div class="muted small">${esc(s.supporterName ? "پشتیبان: " + s.supporterName : "بدون پشتیبان")}</div></div>${statusBadge(s.today)}</a>`).join("")}</div>`
            : `<div class="empty">همه گزارش داده‌اند 🎉</div>`}
        </div>
        ${o.byAdvisor.length ? `<div class="card"><div class="card-head"><h2>به تفکیک مشاور</h2></div>
          <div class="table-wrap"><table><thead><tr><th>مشاور</th><th>شاگردان</th><th>گزارش شب امروز</th></tr></thead><tbody>
          ${o.byAdvisor.map((a) => `<tr><td>${esc(a.name)}</td><td class="num">${fa(a.total)}</td><td>${fa(a.reported)} از ${fa(a.total)}</td></tr>`).join("")}
          </tbody></table></div></div>`
        : `<div class="card"><div class="card-head"><h2>وضعیت امروز</h2></div>
          <div class="kv"><span><span class="badge green">به هدف رسید</span> ${fa(o.met)}</span><span><span class="badge red">نرسید</span> ${fa(o.missed)}</span>
          <span><span class="badge amber">فقط هدف صبح</span> ${fa(o.goalOnly)}</span><span><span class="badge gray">بدون گزارش</span> ${fa(o.none)}</span></div>
          ${me.role !== "supporter" ? `<div class="row" style="margin-top:18px"><a class="btn primary" href="#/import">➕ افزودن گروهی شاگرد</a><a class="btn" href="#/staff">🧑‍💼 پشتیبان‌ها</a></div>` : ""}</div>`}
      </div>`, { inbox: o.unread });
  }

  // ---------- لیست شاگردان (با عملیات گروهی) ----------
  const listState = { q: "", status: "all", supporter: "all", advisor: "all", selected: new Set() };
  async function studentsView(params) {
    if (params.get("status") === "pending") listState.status = "pending";
    const [students, staff] = await Promise.all([Store.students(), me.role === "supporter" ? [] : Store.staff()]);
    const canEdit = me.role !== "supporter";
    const allSupporters = staff.flatMap((a) => a.supporters.map((s) => ({ ...s, advisorName: a.name })));
    const known = new Set(students.map((s) => s.id));
    listState.selected = new Set([...listState.selected].filter((id) => known.has(id)));

    await layout("students", `
      ${pageHead(me.role === "supporter" ? "شاگردان من" : "شاگردان", `${fa(students.length)} نفر`,
        canEdit ? `<a class="btn primary" href="#/import">➕ افزودن گروهی</a><button class="btn" data-export>⬇️ خروجی اکسل</button>` : "")}
      <div class="card">
        <div class="row" style="margin-bottom:12px">
          <input class="input" style="max-width:260px" id="q" placeholder="جستجوی نام یا موبایل..." value="${esc(listState.q)}">
          <select class="input" style="width:auto" id="f-status">
            ${[["all", "همه وضعیت‌ها"], ["pending", "گزارش شب ندارند"], ["met", "به هدف رسیدند"], ["missed", "به هدف نرسیدند"], ["none", "بدون هیچ گزارش"]]
              .map(([v, l]) => `<option value="${v}" ${listState.status === v ? "selected" : ""}>${l}</option>`).join("")}
          </select>
          ${canEdit ? `<select class="input" style="width:auto" id="f-sup"><option value="all">همه پشتیبان‌ها</option><option value="none" ${listState.supporter === "none" ? "selected" : ""}>بدون پشتیبان</option>
            ${allSupporters.map((s) => `<option value="${s.id}" ${listState.supporter === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>` : ""}
          ${me.role === "manager" ? `<select class="input" style="width:auto" id="f-adv"><option value="all">همه مشاوران</option>
            ${staff.map((a) => `<option value="${a.id}" ${listState.advisor === a.id ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select>` : ""}
        </div>
        <div id="table"></div>
      </div>
      <div id="bulk"></div>`);

    const filtered = () => {
      const q = U.toLatinDigits(listState.q).trim();
      return students.filter((s) => {
        if (q && !s.name.includes(listState.q.trim()) && !s.phone.includes(q) && !s.username.includes(q)) return false;
        if (listState.status === "pending" && !(s.status === "none" || s.status === "goal")) return false;
        if (["met", "missed", "none"].includes(listState.status) && s.status !== listState.status) return false;
        if (listState.supporter === "none" && s.supporterId) return false;
        if (!["all", "none"].includes(listState.supporter) && s.supporterId !== listState.supporter) return false;
        if (listState.advisor !== "all" && s.advisorId !== listState.advisor) return false;
        return true;
      });
    };

    function drawTable() {
      const rows = filtered();
      const allOn = rows.length && rows.every((s) => listState.selected.has(s.id));
      qs("#table").innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr>
          ${canEdit ? `<th style="width:36px"><input type="checkbox" class="check" id="all" ${allOn ? "checked" : ""} title="انتخاب همه"></th>` : ""}
          <th>نام</th>${me.role === "manager" ? "<th>مشاور</th>" : ""}${me.role !== "supporter" ? "<th>پشتیبان</th>" : ""}<th>وضعیت امروز</th><th>استریک</th>${canEdit ? "<th>اولیا</th>" : ""}
        </tr></thead><tbody>${rows.map((s) => `<tr class="link-row ${listState.selected.has(s.id) ? "selected" : ""}" data-id="${s.id}">
          ${canEdit ? `<td><input type="checkbox" class="check" data-sel="${s.id}" ${listState.selected.has(s.id) ? "checked" : ""}></td>` : ""}
          <td><b>${esc(s.name)}</b><div class="muted small" dir="ltr" style="text-align:right">${esc(s.phone || s.username)}</div></td>
          ${me.role === "manager" ? `<td>${esc(s.advisorName)}</td>` : ""}
          ${me.role !== "supporter" ? `<td>${s.supporterName ? esc(s.supporterName) : `<span class="muted">—</span>`}</td>` : ""}
          <td>${statusBadge(s.today)}</td><td class="num">${s.streak ? "🔥 " + fa(s.streak) : "–"}</td>
          ${canEdit ? `<td>${s.parentCount ? "✓" : "–"}</td>` : ""}</tr>`).join("")}</tbody></table></div>
          <p class="muted small" style="margin:10px 2px 0">${fa(rows.length)} نفر نمایش داده شده${canEdit ? " — با تیک زدن، عملیات گروهی ظاهر می‌شود. برای انتخاب یک بازه، اولی را تیک بزنید و آخری را با Shift." : ""}</p>`
        : `<div class="empty">شاگردی با این فیلترها پیدا نشد.</div>`;
      on("tr.link-row", "click", (e) => {
        if (e.target.closest("input")) return;
        location.hash = `#/student/${e.currentTarget.dataset.id}`;
      }, qs("#table"));
      // انتخاب تکی بدون رسم دوباره جدول (برای لیست‌های بزرگ)؛ با Shift یک بازه انتخاب می‌شود
      const syncRow = (id) => {
        const isOn = listState.selected.has(id);
        const tr = qs(`tr[data-id="${id}"]`);
        if (tr) { tr.classList.toggle("selected", isOn); tr.querySelector("[data-sel]").checked = isOn; }
      };
      on("[data-sel]", "click", (e) => {
        const id = e.target.dataset.sel;
        const idx = rows.findIndex((s) => s.id === id);
        const turnOn = e.target.checked;
        const range = e.shiftKey && listState.lastIdx != null ? rows.slice(Math.min(idx, listState.lastIdx), Math.max(idx, listState.lastIdx) + 1) : [rows[idx]];
        range.forEach((s) => { turnOn ? listState.selected.add(s.id) : listState.selected.delete(s.id); syncRow(s.id); });
        listState.lastIdx = idx;
        const all = qs("#all");
        if (all) all.checked = rows.every((s) => listState.selected.has(s.id));
        drawBulk();
      }, qs("#table"));
      qs("#all")?.addEventListener("change", (e) => {
        rows.forEach((s) => { e.target.checked ? listState.selected.add(s.id) : listState.selected.delete(s.id); syncRow(s.id); });
        drawBulk();
      });
    }

    function drawBulk() {
      const n = listState.selected.size;
      const box = qs("#bulk");
      if (!canEdit || !n) { box.innerHTML = ""; return; }
      const ids = [...listState.selected];
      box.innerHTML = `<div class="bulk-bar no-print"><b>${fa(n)} نفر انتخاب شده</b>
        <select class="input" id="b-sup"><option value="">سپردن به پشتیبان...</option><option value="__none">بدون پشتیبان</option>
          ${allSupporters.map((s) => `<option value="${s.id}">${esc(s.name)}${me.role === "manager" ? ` (${esc(s.advisorName)})` : ""}</option>`).join("")}</select>
        <button class="btn sm" data-b="dist">⚖️ تقسیم مساوی بین پشتیبان‌ها</button>
        ${me.role === "manager" ? `<select class="input" id="b-adv"><option value="">انتقال به مشاور...</option>${staff.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join("")}</select>` : ""}
        <button class="btn sm" data-b="pw">🔑 رمز جدید + دانلود</button>
        <button class="btn sm" data-b="del">🗑 حذف</button>
        <span class="spacer"></span><button class="btn sm" data-b="clear">لغو انتخاب</button></div>`;
      qs("#b-sup").addEventListener("change", async (e) => {
        if (!e.target.value) return;
        const r = await run(() => Store.assignSupporter(ids, e.target.value === "__none" ? null : e.target.value));
        toast(`${fa(r.changed)} نفر ثبت شد${r.skipped ? ` — ${fa(r.skipped)} نفر رد شد (پشتیبان باید از مشاور همان شاگرد باشد)` : ""}`);
        studentsView(new URLSearchParams());
      });
      qs("#b-adv")?.addEventListener("change", async (e) => {
        if (!e.target.value) return;
        await run(() => Store.moveStudents(ids, e.target.value), "منتقل شد (پشتیبان این شاگردان خالی شد)");
        studentsView(new URLSearchParams());
      });
      on("[data-b]", "click", async (e) => {
        const act = e.currentTarget.dataset.b;
        if (act === "clear") { listState.selected.clear(); drawTable(); drawBulk(); return; }
        if (act === "dist") {
          const r = await run(() => Store.distributeToSupporters(ids));
          const parts = Object.entries(r.counts).map(([k, v]) => `${k}: ${fa(v)}`).join("، ");
          toast(parts ? `تقسیم شد — ${parts}` : "مشاور این شاگردان پشتیبانی ندارد.");
          studentsView(new URLSearchParams());
        }
        if (act === "pw" && await confirmBox("رمز جدید", `برای ${fa(n)} شاگرد و اولیایشان رمز جدید ساخته می‌شود و رمزهای قبلی کار نمی‌کنند.`, "ساخت رمز جدید", false)) {
          const list = await run(() => Store.resetStudentPasswords(ids));
          downloadCreds(list, "رمزهای-جدید.csv");
          toast("فایل اطلاعات ورود دانلود شد");
        }
        if (act === "del" && await confirmBox("حذف شاگردان", `${fa(n)} شاگرد با همه گزارش‌ها و حساب اولیایشان حذف می‌شوند و قابل برگشت نیست.`, "حذف کن")) {
          const k = await run(() => Store.deleteStudents(ids));
          listState.selected.clear();
          toast(`${fa(k)} شاگرد حذف شد`);
          studentsView(new URLSearchParams());
        }
      }, box);
    }

    qs("#q").addEventListener("input", (e) => { listState.q = e.target.value; drawTable(); });
    qs("#f-status").addEventListener("change", (e) => { listState.status = e.target.value; drawTable(); });
    qs("#f-sup")?.addEventListener("change", (e) => { listState.supporter = e.target.value; drawTable(); });
    qs("#f-adv")?.addEventListener("change", (e) => { listState.advisor = e.target.value; drawTable(); });
    qs("[data-export]")?.addEventListener("click", () => {
      U.download("لیست-شاگردان.csv", U.toCsv([["نام", "نام کاربری", "موبایل", "مشاور", "پشتیبان", "مطالعه امروز", "هدف امروز", "استریک"],
        ...filtered().map((s) => [s.name, s.username, s.phone, s.advisorName, s.supporterName || "", s.today?.doneHours ?? "", s.today?.targetHours ?? "", s.streak])]));
    });
    drawTable();
    drawBulk();
  }

  // ---------- افزودن گروهی شاگرد ----------
  const imp = { step: 1, text: "", advisorId: "", distribute: true, rows: [], results: [] };
  const TEMPLATE = "نام و نام خانوادگی,موبایل شاگرد,موبایل ولی,پشتیبان\nعلی رضایی,09121234567,09127654321,\nسارا محمدی,09351112233,,";

  function mapRows(table) {
    if (!table.length) return [];
    const head = table[0].map((h) => h.replace(/\s+/g, " ").trim());
    const hasHeader = head.some((h) => /نام|موبایل|تلفن|شماره|پشتیبان/.test(h));
    let idx = { name: 0, phone: 1, parentPhone: 2, supporter: 3, last: -1 };
    if (hasHeader) {
      const find = (re, not) => head.findIndex((h) => re.test(h) && !(not && not.test(h)));
      idx = {
        name: find(/نام/, /خانوادگی|ولی|پشتیبان|کاربری/) >= 0 ? find(/نام/, /خانوادگی|ولی|پشتیبان|کاربری/) : find(/نام/),
        last: find(/خانوادگی/, /^نام و نام خانوادگی$/),
        parentPhone: find(/ولی|والد|پدر|مادر/),
        phone: find(/موبایل|تلفن|شماره|همراه/, /ولی|والد|پدر|مادر/),
        supporter: find(/پشتیبان/),
      };
      if (idx.last === idx.name) idx.last = -1;
    }
    const cell = (r, i) => (i >= 0 && i < r.length ? r[i].trim() : "");
    return (hasHeader ? table.slice(1) : table).map((r, i) => ({
      line: i + 1 + (hasHeader ? 1 : 0),
      name: [cell(r, idx.name), cell(r, idx.last)].filter(Boolean).join(" ").replace(/\s+/g, " "),
      phone: cell(r, idx.phone), parentPhone: cell(r, idx.parentPhone), supporterName: cell(r, idx.supporter),
    })).filter((r) => r.name || r.phone || r.parentPhone);
  }
  function validate(rows, existing, supporters) {
    const seen = new Map();
    rows.forEach((r) => seen.set(r.name, (seen.get(r.name) || 0) + 1));
    const existingNames = new Set(existing.map((s) => s.name));
    return rows.map((r) => {
      const errors = [], warns = [];
      const p = U.normalizePhone(r.phone), pp = U.normalizePhone(r.parentPhone);
      if (!r.name) errors.push("نام خالی است");
      if (r.phone && !U.isMobile(p)) warns.push("موبایل نامعتبر (ذخیره نمی‌شود)");
      if (r.parentPhone && !U.isMobile(pp)) warns.push("موبایل ولی نامعتبر");
      if (r.name && seen.get(r.name) > 1) warns.push("نام تکراری در همین لیست");
      if (r.name && existingNames.has(r.name)) warns.push("شاگردی با همین نام از قبل هست");
      if (r.supporterName && !supporters.some((s) => s.name.trim() === r.supporterName.trim())) warns.push("پشتیبان پیدا نشد");
      return { ...r, phone: U.isMobile(p) ? p : r.phone, parentPhone: U.isMobile(pp) ? pp : r.parentPhone, errors, warns };
    });
  }

  async function importView() {
    const staff = await Store.staff();
    if (!imp.advisorId || !staff.some((a) => a.id === imp.advisorId)) imp.advisorId = me.role === "advisor" ? me.id : staff[0]?.id;
    const adv = staff.find((a) => a.id === imp.advisorId);
    const supporters = adv ? adv.supporters : [];
    const steps = ["۱. وارد کردن لیست", "۲. بررسی", "۳. اطلاعات ورود"];
    const stepsHtml = `<div class="steps">${steps.map((s, i) => `<span class="${i + 1 === imp.step ? "on" : i + 1 < imp.step ? "done" : ""}">${s}</span>`).join("")}</div>`;
    let body = "";

    if (imp.step === 1) {
      body = `<div class="grid split">
        <div class="card stack">
          ${me.role === "manager" ? `<div class="field"><label>مشاور این شاگردان</label><select class="input" id="i-adv">
            ${staff.map((a) => `<option value="${a.id}" ${a.id === imp.advisorId ? "selected" : ""}>${esc(a.name)} (${fa(a.studentCount)} شاگرد)</option>`).join("")}</select></div>` : ""}
          <div class="field"><label>لیست شاگردان را از اکسل کپی کنید و اینجا بچسبانید</label>
            <textarea class="input" id="i-text" placeholder="نام و نام خانوادگی	موبایل شاگرد	موبایل ولی	پشتیبان&#10;علی رضایی	09121234567	09127654321&#10;سارا محمدی	09351112233">${esc(imp.text)}</textarea>
            <span class="hint">هر سطر یک شاگرد. فقط ستون نام اجباری است؛ موبایل‌ها و پشتیبان اختیاری‌اند. ردیف عنوان خودکار تشخیص داده می‌شود.</span></div>
          <div class="dropzone" id="drop">📄 یا فایل CSV را اینجا رها کنید / برای انتخاب بزنید<input type="file" id="file" accept=".csv,.txt,text/csv" hidden></div>
          <label class="row small"><input type="checkbox" class="check" id="i-dist" ${imp.distribute ? "checked" : ""} ${supporters.length ? "" : "disabled"}>
            تقسیم خودکار و مساوی بین پشتیبان‌ها ${supporters.length ? `(${supporters.map((s) => esc(s.name)).join("، ")})` : "— این مشاور هنوز پشتیبان ندارد"}</label>
          <div class="row"><button class="btn primary" id="i-next">بررسی لیست ←</button><span class="muted small" id="i-count"></span></div>
        </div>
        <div class="card stack">
          <h3>راهنما</h3>
          <ol class="small" style="margin:0;padding-inline-start:18px">
            <li>در اکسل، ستون‌های نام (و در صورت وجود موبایل شاگرد، موبایل ولی، پشتیبان) را انتخاب و کپی کنید.</li>
            <li>در کادر بچسبانید و «بررسی لیست» را بزنید.</li>
            <li>برای هر شاگرد و ولی‌اش نام کاربری و رمز ساخته می‌شود؛ فایل اکسل آن را دانلود یا کارت‌ها را چاپ کنید.</li>
          </ol>
          <p class="small muted" style="margin:0">اگر موبایل شاگرد معتبر باشد، همان نام کاربری او می‌شود.</p>
          <button class="btn" id="tpl">⬇️ دانلود فایل نمونه</button>
        </div></div>`;
    } else if (imp.step === 2) {
      const ok = imp.rows.filter((r) => !r.errors.length);
      const bad = imp.rows.length - ok.length, warn = imp.rows.filter((r) => !r.errors.length && r.warns.length).length;
      body = `<div class="card">
        <div class="row" style="margin-bottom:12px">
          <span class="badge green">${fa(ok.length)} ردیف آماده</span>${warn ? `<span class="badge amber">${fa(warn)} با هشدار</span>` : ""}${bad ? `<span class="badge red">${fa(bad)} خطادار (ساخته نمی‌شود)</span>` : ""}
          <span class="muted small">مشاور: <b>${esc(adv?.name || "")}</b>${imp.distribute && supporters.length ? " · تقسیم خودکار بین پشتیبان‌ها" : ""}</span>
        </div>
        <div class="table-wrap" style="max-height:52vh"><table><thead><tr><th>ردیف</th><th>نام</th><th>موبایل</th><th>موبایل ولی</th><th>پشتیبان</th><th>وضعیت</th></tr></thead><tbody>
        ${imp.rows.map((r) => `<tr class="${r.errors.length ? "err" : r.warns.length ? "warn" : ""}"><td class="num">${fa(r.line)}</td><td>${esc(r.name) || "—"}</td>
          <td dir="ltr" style="text-align:right">${esc(r.phone)}</td><td dir="ltr" style="text-align:right">${esc(r.parentPhone)}</td><td>${esc(r.supporterName)}</td>
          <td class="wrap small">${r.errors.length ? `<span style="color:var(--rose)">${esc(r.errors.join("، "))}</span>` : r.warns.length ? esc(r.warns.join("، ")) : "✓"}</td></tr>`).join("")}
        </tbody></table></div>
        <div class="row" style="margin-top:14px"><button class="btn" id="i-back">→ ویرایش لیست</button>
          <button class="btn primary" id="i-create" ${ok.length ? "" : "disabled"}>ساخت ${fa(ok.length)} حساب شاگرد و ولی</button></div></div>`;
    } else {
      body = `<div class="card">
        <div class="alert ok" style="margin-bottom:14px">✅ ${fa(imp.results.length)} شاگرد و ولی ساخته شدند. رمزها فقط همین حالا نمایش داده می‌شوند — فایل را دانلود یا کارت‌ها را چاپ کنید.</div>
        <div class="row no-print" style="margin-bottom:14px"><button class="btn primary" id="r-dl">⬇️ دانلود اکسل اطلاعات ورود</button>
          <button class="btn" id="r-print">🖨 چاپ کارت‌های ورود</button><a class="btn" href="#/students">رفتن به لیست شاگردان</a>
          <button class="btn" id="r-more">➕ افزودن لیست دیگر</button></div>
        <div class="table-wrap no-print" style="max-height:55vh"><table><thead><tr><th>نام</th><th>نام کاربری</th><th>رمز</th><th>ولی</th><th>رمز ولی</th><th>پشتیبان</th></tr></thead><tbody>
        ${imp.results.map((c) => `<tr><td>${esc(c.name)}</td><td dir="ltr" style="text-align:right">${esc(c.username)}</td><td dir="ltr" style="text-align:right"><b>${esc(c.password)}</b></td>
          <td dir="ltr" style="text-align:right">${esc(c.parentUsername)}</td><td dir="ltr" style="text-align:right"><b>${esc(c.parentPassword)}</b></td><td>${esc(c.supporterName || "—")}</td></tr>`).join("")}
        </tbody></table></div>${credsCards(imp.results)}</div>`;
    }

    await layout("import", pageHead("افزودن گروهی شاگرد", "صدها شاگرد را با یک کپی از اکسل اضافه کنید") + stepsHtml + body);

    if (imp.step === 1) {
      const text = qs("#i-text");
      const count = () => { const n = mapRows(U.parseTable(text.value)).length; qs("#i-count").textContent = n ? `${fa(n)} ردیف` : ""; };
      text.addEventListener("input", () => { imp.text = text.value; count(); });
      count();
      qs("#i-adv")?.addEventListener("change", (e) => { imp.advisorId = e.target.value; imp.text = text.value; importView(); });
      qs("#i-dist").addEventListener("change", (e) => (imp.distribute = e.target.checked));
      qs("#tpl").addEventListener("click", () => U.download("نمونه-لیست-شاگردان.csv", TEMPLATE));
      const drop = qs("#drop"), file = qs("#file");
      const readFile = async (f) => {
        if (!f) return;
        if (/\.xlsx?$/i.test(f.name)) { toast("فایل اکسل را با «Save As → CSV UTF-8» ذخیره کنید، یا ستون‌ها را کپی کنید.", true); return; }
        text.value = imp.text = (await f.text()).replace(/^﻿/, "");
        count();
      };
      drop.addEventListener("click", () => file.click());
      file.addEventListener("change", () => readFile(file.files[0]));
      drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
      drop.addEventListener("dragleave", () => drop.classList.remove("over"));
      drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); readFile(e.dataTransfer.files[0]); });
      qs("#i-next").addEventListener("click", async () => {
        const rows = mapRows(U.parseTable(text.value));
        if (!rows.length) { toast("لیستی وارد نشده.", true); return; }
        imp.rows = validate(rows, await Store.students(), supporters);
        imp.step = 2;
        importView();
      });
    } else if (imp.step === 2) {
      qs("#i-back").addEventListener("click", () => { imp.step = 1; importView(); });
      qs("#i-create").addEventListener("click", async () => {
        const ok = imp.rows.filter((r) => !r.errors.length);
        imp.results = await run(() => Store.bulkAddStudents({ advisorId: imp.advisorId, rows: ok, distribute: imp.distribute && supporters.length > 0 }));
        imp.step = 3;
        imp.text = "";
        importView();
      });
    } else {
      qs("#r-dl").addEventListener("click", () => downloadCreds(imp.results));
      qs("#r-print").addEventListener("click", () => window.print());
      qs("#r-more").addEventListener("click", () => { imp.step = 1; imp.results = []; importView(); });
    }
  }

  // ---------- صفحه یک شاگرد (برای کادر) ----------
  async function studentDetailView(id) {
    const [s, w, hist, fb, pm] = await Promise.all([
      Store.student(id), Store.week(id), Store.history(id), Store.feedbackFor(id), Store.parentMessagesFor(id)]);
    const staff = me.role === "manager" || me.role === "advisor" ? await Store.staff() : [];
    const sups = staff.find((a) => a.id === s.advisorId)?.supporters || [];
    const isLead = me.role === "manager" || me.role === "advisor";
    await layout("students", `
      ${pageHead(esc(s.name), `مشاور: ${esc(s.advisorName)} · پشتیبان: ${esc(s.supporterName || "ندارد")} · ${s.streak ? "🔥 " + fa(s.streak) + " روز پیاپی" : "بدون استریک"}`,
        `<a class="btn" href="#/students">→ بازگشت</a>`)}
      <div class="card no-print"><div class="row">
        <button class="btn primary" data-a="fbs">💬 بازخورد به شاگرد</button>
        ${me.role === "supporter" ? `<button class="btn" data-a="fba">📝 گزارش به مشاور</button>` : ""}
        ${isLead ? `<button class="btn" data-a="pmsg">✉️ پیام به اولیا</button><button class="btn" data-a="pcard">📤 ارسال کارنامه به اولیا</button>
          <button class="btn" data-a="pw">🔑 رمز جدید</button>
          <select class="input" style="width:auto" id="d-sup"><option value="">پشتیبان: ${esc(s.supporterName || "ندارد")}</option><option value="__none">بدون پشتیبان</option>
            ${sups.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select>` : ""}
      </div>${isLead ? `<p class="muted small" style="margin:10px 0 0">نام کاربری شاگرد: <b dir="ltr">${esc(s.username)}</b>${s.phone ? ` · موبایل: <span dir="ltr">${esc(s.phone)}</span>` : ""}
        · اولیا: ${s.parents.length ? s.parents.map((p) => `<b dir="ltr">${esc(p.username)}</b>`).join("، ") : "ندارد"}</p>` : ""}</div>
      <h2 style="margin:22px 0 12px">کارنامه ۷ روز اخیر</h2>
      ${weekHtml(w)}
      <div class="grid cols-2" style="margin-top:16px">
        <div class="card"><div class="card-head"><h2>گزارش‌های روزانه</h2></div>${historyHtml(hist)}</div>
        <div class="stack">
          <div class="card"><div class="card-head"><h2>بازخوردها</h2></div>${feedbackListHtml(fb, true)}</div>
          ${isLead ? `<div class="card"><div class="card-head"><h2>پیام‌های اولیا</h2></div>${pm.length ? `<div class="list">${pm.map((m) => `
            <div class="list-item"><div class="grow"><div class="row"><b>${m.kind === "card" ? "📊 کارنامه هفتگی" : "✉️ پیام"}</b>
              <span class="badge ${m.seenCount ? "green" : "amber"}">${m.seenCount ? `دیده شد (${fa(m.seenCount)} از ${fa(m.parentCount)})` : "هنوز دیده نشده"}</span>
              <span class="spacer"></span><span class="muted small">${esc(U.faDateTime(m.createdAt))}</span></div>
              ${m.text ? `<div class="msg-text">${esc(m.text)}</div>` : ""}</div></div>`).join("")}</div>` : `<div class="empty">پیامی ارسال نشده.</div>`}</div>` : ""}
        </div>
      </div>`);
    const again = () => studentDetailView(id);
    on("[data-a]", "click", async (e) => {
      const a = e.currentTarget.dataset.a;
      if (a === "fbs") await textBox(`بازخورد به ${s.name}`, "مستقیم برای خود شاگرد نمایش داده می‌شود.", "ارسال",
        (t) => run(() => Store.sendFeedback(id, "student", t), "برای شاگرد ارسال شد"));
      if (a === "fba") await textBox(`گزارش درباره ${s.name}`, "برای مشاور این شاگرد ارسال می‌شود.", "ارسال برای مشاور",
        (t) => run(() => Store.sendFeedback(id, "advisor", t), "برای مشاور ارسال شد"));
      if (a === "pmsg") await textBox(`پیام به اولیای ${s.name}`, "ولی در صفحه خودش پیام را می‌بیند و «دیدم» می‌زند.", "ارسال",
        (t) => run(() => Store.sendParentMessage(id, t, "msg"), "برای اولیا ارسال شد"));
      if (a === "pcard" && await confirmBox("ارسال کارنامه", "کارنامه هفتگی این شاگرد در صفحه اولیا نمایش داده می‌شود.", "ارسال", false)) {
        await run(() => Store.sendParentMessage(id, `کارنامه هفته: ${fa(w.totalHours)} ساعت مطالعه، ${fa(w.totalTests)} تست، ${fa(w.activeDays)} روز فعال.`, "card"), "کارنامه ارسال شد");
      }
      if (a === "pw" && await confirmBox("رمز جدید", "برای شاگرد و ولی‌اش رمز جدید ساخته می‌شود.", "ساخت رمز", false)) {
        const [c] = await run(() => Store.resetStudentPasswords([id]));
        await modal({ title: "اطلاعات ورود جدید", cancelText: "", okText: "بستن",
          body: `<p>شاگرد: <b dir="ltr">${esc(c.username)}</b> / رمز: <b dir="ltr">${esc(c.password)}</b></p>${c.parentUsername ? `<p>ولی: <b dir="ltr">${esc(c.parentUsername)}</b> / رمز: <b dir="ltr">${esc(c.parentPassword)}</b></p>` : ""}` });
      }
      again();
    });
    qs("#d-sup")?.addEventListener("change", async (e) => {
      if (!e.target.value) return;
      await run(() => Store.assignSupporter([id], e.target.value === "__none" ? null : e.target.value), "پشتیبان ثبت شد");
      again();
    });
  }

  // ---------- کادر: مشاوران و پشتیبان‌ها ----------
  async function staffView() {
    const staff = await Store.staff();
    const showCreds = (c, title) => modal({ title, cancelText: "", okText: "بستن",
      body: `<p>${esc(c.user.name)}</p><p>نام کاربری: <b dir="ltr">${esc(c.user.username)}</b><br>رمز: <b dir="ltr">${esc(c.password)}</b></p>
             <p class="muted small">این اطلاعات را برای ایشان بفرستید؛ رمز فقط همین یک بار نمایش داده می‌شود.</p>` });
    await layout("staff", `
      ${pageHead(me.role === "manager" ? "مشاوران و پشتیبان‌ها" : "پشتیبان‌ها", "هر پشتیبان فقط شاگردانی را می‌بیند که به او سپرده شده‌اند",
        me.role === "manager" ? `<button class="btn primary" data-add-adv>➕ مشاور جدید</button>` : "")}
      <div class="stack">${staff.map((a) => `<div class="card">
        <div class="card-head"><div><h2>${esc(a.name)} ${a.role === "manager" ? `<span class="badge indigo">مدیر</span>` : ""}</h2>
          <div class="muted small">${fa(a.studentCount)} شاگرد · نام کاربری: <span dir="ltr">${esc(a.username)}</span></div></div>
          <div class="row"><button class="btn sm" data-add-sup="${a.id}">➕ پشتیبان</button>
            ${me.role === "manager" && a.role === "advisor" ? `<button class="btn sm" data-pw="${a.id}">🔑 رمز جدید</button><button class="btn sm danger" data-rm="${a.id}" data-name="${esc(a.name)}" data-kind="advisor">حذف مشاور</button>` : ""}</div></div>
        ${a.supporters.length ? `<div class="table-wrap"><table><thead><tr><th>پشتیبان</th><th>نام کاربری</th><th>شاگردان</th><th></th></tr></thead><tbody>
          ${a.supporters.map((s) => `<tr><td>${esc(s.name)}</td><td dir="ltr" style="text-align:right">${esc(s.username)}</td><td class="num">${fa(s.studentCount)}</td>
            <td><div class="row"><button class="btn sm" data-pw="${s.id}">🔑 رمز جدید</button><button class="btn sm danger" data-rm="${s.id}" data-name="${esc(s.name)}" data-kind="supporter">حذف</button></div></td></tr>`).join("")}
          </tbody></table></div>` : `<div class="empty">هنوز پشتیبانی ندارد.</div>`}
      </div>`).join("")}</div>`);
    qs("[data-add-adv]")?.addEventListener("click", () => modal({
      title: "مشاور جدید", okText: "ساخت حساب", body: `<div class="field"><label>نام</label><input class="input" placeholder="مثلاً: مهندس زیلابی"></div>`,
      onOk: async (root) => { const c = await run(() => Store.createStaff({ role: "advisor", name: root.querySelector("input").value })); setTimeout(() => showCreds(c, "حساب مشاور ساخته شد").then(staffView)); return true; },
    }));
    on("[data-add-sup]", "click", (e) => modal({
      title: "پشتیبان جدید", okText: "ساخت حساب", body: `<div class="field"><label>نام پشتیبان</label><input class="input" placeholder="مثلاً: خانم رضایی"></div>`,
      onOk: async (root) => { const c = await run(() => Store.createStaff({ role: "supporter", name: root.querySelector("input").value, advisorId: e.currentTarget.dataset.addSup })); setTimeout(() => showCreds(c, "حساب پشتیبان ساخته شد").then(staffView)); return true; },
    }));
    on("[data-pw]", "click", async (e) => {
      if (!await confirmBox("رمز جدید", "رمز قبلی دیگر کار نمی‌کند.", "ساخت رمز", false)) return;
      const c = await run(() => Store.resetPassword(e.currentTarget.dataset.pw));
      showCreds(c, "رمز جدید");
    });
    on("[data-rm]", "click", async (e) => {
      const { rm, name, kind } = e.currentTarget.dataset;
      const text = kind === "advisor" ? `شاگردان و پشتیبان‌های «${name}» به شما منتقل می‌شوند.` : `شاگردان «${name}» بدون پشتیبان می‌مانند (پیش مشاورشان).`;
      if (await confirmBox("حذف", text, "حذف کن")) { await run(() => Store.removeStaff(rm), "حذف شد"); staffView(); }
    });
  }

  // ---------- گزارش پشتیبان‌ها به مشاور ----------
  async function inboxView() {
    const items = await Store.inbox();
    const unread = items.filter((f) => !f.readAt).length;
    await layout("inbox", `
      ${pageHead("گزارش پشتیبان‌ها", `${fa(unread)} خوانده‌نشده`)}
      <div class="card">${items.length ? `<div class="list">${items.map((f) => `
        <div class="list-item" style="${f.readAt ? "" : "background:#fafaff;margin:0 -20px;padding:12px 20px"}"><div class="grow">
          <div class="row"><b>${esc(f.fromName)}</b><span class="muted small">درباره</span><a href="#/student/${f.studentId}"><b>${esc(f.studentName)}</b></a>
            ${f.readAt ? "" : `<span class="badge red">جدید</span>`}<span class="spacer"></span><span class="muted small">${esc(U.faDateTime(f.createdAt))}</span></div>
          <div class="msg-text">${esc(f.text)}</div>
          ${f.readAt ? "" : `<button class="btn sm" style="margin-top:8px" data-read="${f.id}">✓ خواندم</button>`}</div></div>`).join("")}</div>`
        : `<div class="empty">هنوز گزارشی از پشتیبان‌ها نرسیده.</div>`}</div>`, { inbox: unread });
    on("[data-read]", "click", async (e) => { await Store.markRead(e.currentTarget.dataset.read); inboxView(); });
  }

  // ---------- شاگرد: امروز ----------
  async function todayView() {
    const { day, report: r, tasks, streak } = await Store.myDay();
    const fbUnread = (await Store.myFeedback()).filter((f) => !f.readAt).length;
    const hasGoal = r && r.targetHours != null, hasNight = r && r.doneHours != null;
    const editMorning = todayView.editMorning || !hasGoal, editNight = todayView.editNight || !hasNight;
    const numField = (id, label, val, hint) => `<div class="field"><label for="${id}">${label}</label>
      <input class="input" id="${id}" inputmode="decimal" value="${val != null ? esc(fa(val)) : ""}" placeholder="${hint}"></div>`;
    const fb = hasNight ? nightFeedback(r) : null;
    await layout("today", `
      ${pageHead(`سلام ${esc(me.name)} 🌸`, `${esc(U.weekday(day))} ${esc(U.faDate(day))}${streak ? ` · 🔥 ${fa(streak)} روز پیاپی` : ""}`)}
      ${fbUnread ? `<a class="alert info" style="display:block;margin-bottom:16px" href="#/messages">💬 ${fa(fbUnread)} بازخورد جدید از پشتیبان/مشاورت داری.</a>` : ""}
      <div class="grid cols-2">
        <div class="card"><div class="card-head"><h2>☀️ هدف صبحگاهی</h2>${hasGoal && !editMorning ? `<button class="btn sm" data-edit="m">ویرایش</button>` : ""}</div>
          ${editMorning ? `<form class="stack" id="f-m">
            <div class="grid cols-3">${numField("th", "هدف ساعت مطالعه", r?.targetHours, "مثلاً ۸")}${numField("tt", "هدف تعداد تست", r?.targetTests, "مثلاً ۱۲۰")}${numField("sl", "خواب دیشب (ساعت)", r?.sleep, "مثلاً ۷")}</div>
            <button class="btn primary">ثبت هدف امروز</button></form>`
          : `<div class="kv"><span>⏱ هدف: <b>${fa(r.targetHours)}</b> ساعت</span><span>📝 <b>${fa(r.targetTests)}</b> تست</span><span>😴 خواب: <b>${fa(r.sleep)}</b> ساعت</span></div>`}
        </div>
        <div class="card"><div class="card-head"><h2>📝 چک‌لیست امروز</h2><span class="muted small">${fa(tasks.filter((t) => t.done).length)} از ${fa(tasks.length)}</span></div>
          <form class="row" id="f-t" style="margin-bottom:10px"><input class="input" id="tt-title" style="flex:1" placeholder="مثلاً: زیست فصل ۱ + ۳۰ تست"><button class="btn primary">افزودن</button></form>
          <div class="stack" style="gap:8px">${tasks.map((t) => `<div class="task ${t.done ? "done" : ""}">
            <input type="checkbox" class="check" data-tg="${t.id}" ${t.done ? "checked" : ""}><span class="title">${esc(t.title)}</span>
            <button class="btn ghost sm" data-del="${t.id}" title="حذف">✕</button></div>`).join("") || `<div class="empty" style="padding:12px">هنوز درسی اضافه نکرده‌ای.</div>`}</div>
        </div>
      </div>
      <div class="card" style="margin-top:16px"><div class="card-head"><h2>🌙 گزارش شبانه</h2>${hasNight && !editNight ? `<button class="btn sm" data-edit="n">ویرایش</button>` : ""}</div>
        ${!hasGoal ? `<div class="alert warn">اول هدف صبحگاهی امروز را ثبت کن.</div>`
        : editNight ? `<form class="stack" id="f-n"><div class="grid cols-4">
            ${numField("dh", "ساعت مطالعه امروز", r.doneHours, `هدف: ${fa(r.targetHours)}`)}${numField("dt", "تعداد تست", r.doneTests, `هدف: ${fa(r.targetTests)}`)}
            ${numField("ch", "کلاس کنکور (ساعت)", r.classHours, "اگر نداشتی ۰")}${numField("ph", "موبایل غیردرسی (ساعت)", r.phoneHours, "از Screen Time گوشی")}</div>
            <button class="btn primary">ثبت گزارش شب</button></form>`
        : `<div class="alert ${fb.ok ? "ok" : "info"}">${fb.lines.map(esc).join("<br>")}<br><b>${esc(fb.cheer)}</b></div>`}
      </div>`, { messages: fbUnread });

    qs("#f-m")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      await run(() => Store.saveMorning({ targetHours: U.parseNum(qs("#th").value), targetTests: U.parseNum(qs("#tt").value), sleep: U.parseNum(qs("#sl").value) }), "هدف امروز ثبت شد ✅");
      todayView.editMorning = false; todayView();
    });
    qs("#f-n")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      await run(() => Store.saveNight({ doneHours: U.parseNum(qs("#dh").value), doneTests: U.parseNum(qs("#dt").value),
        classHours: U.parseNum(qs("#ch").value), phoneHours: U.parseNum(qs("#ph").value) }), "گزارش شب ثبت شد 🌙");
      todayView.editNight = false; todayView();
    });
    qs("#f-t").addEventListener("submit", async (e) => { e.preventDefault(); await run(() => Store.addTask(qs("#tt-title").value)); todayView(); });
    on("[data-tg]", "change", async (e) => { await run(() => Store.toggleTask(e.target.dataset.tg)); todayView(); });
    on("[data-del]", "click", async (e) => { await Store.deleteTask(e.currentTarget.dataset.del); todayView(); });
    on("[data-edit]", "click", (e) => { todayView[e.currentTarget.dataset.edit === "m" ? "editMorning" : "editNight"] = true; todayView(); });
  }

  async function myWeekView() {
    const [w, hist] = await Promise.all([Store.week(me.id), Store.history(me.id)]);
    await layout("week", `${pageHead("کارنامه هفتگی", "۷ روز اخیر")}${weekHtml(w)}
      <div class="card" style="margin-top:16px"><div class="card-head"><h2>گزارش‌های روزانه</h2></div>${historyHtml(hist)}</div>`);
  }
  async function messagesView() {
    const items = await Store.myFeedback();
    await layout("messages", `${pageHead("بازخوردها", "پیام‌های پشتیبان و مشاورت")}<div class="card">${feedbackListHtml(items, false)}</div>`);
    for (const f of items.filter((x) => !x.readAt)) await Store.markRead(f.id);
  }

  // ---------- ولی ----------
  async function childView() {
    const { student, messages } = await Store.myChild();
    const [w, hist] = await Promise.all([Store.week(student.id), Store.history(student.id)]);
    const unseen = messages.filter((m) => !m.seenByMe).length;
    await layout("child", `
      ${pageHead(`کارنامه ${esc(student.name)}`, "۷ روز اخیر")}
      ${messages.length ? `<div class="card" style="margin-bottom:16px"><div class="card-head"><h2>پیام‌های مشاور</h2>${unseen ? `<span class="badge red">${fa(unseen)} جدید</span>` : ""}</div>
        <div class="list">${messages.map((m) => `<div class="list-item"><div class="grow">
          <div class="row"><b>${m.kind === "card" ? "📊 کارنامه هفتگی" : "✉️ " + esc(m.fromName)}</b><span class="spacer"></span><span class="muted small">${esc(U.faDateTime(m.createdAt))}</span></div>
          ${m.text ? `<div class="msg-text">${esc(m.text)}</div>` : ""}
          ${m.seenByMe ? `<span class="badge green" style="margin-top:6px">✓ دیده شد</span>` : `<button class="btn primary sm" style="margin-top:8px" data-ack="${m.id}">✅ دیدم</button>`}
        </div></div>`).join("")}</div></div>` : ""}
      ${weekHtml(w)}
      <div class="card" style="margin-top:16px"><div class="card-head"><h2>گزارش‌های روزانه</h2></div>${historyHtml(hist)}</div>`, { child: unseen });
    on("[data-ack]", "click", async (e) => { await Store.ackParentMessage(e.currentTarget.dataset.ack); toast("ممنون، ثبت شد 🌸"); childView(); });
  }

  // ---------- مسیریابی ----------
  const HOME = { manager: "dashboard", advisor: "dashboard", supporter: "dashboard", student: "today", parent: "child" };
  const ROUTES = {
    manager: { dashboard: dashboardView, students: studentsView, import: importView, staff: staffView, inbox: inboxView, student: studentDetailView },
    supporter: { dashboard: dashboardView, students: studentsView, student: studentDetailView },
    student: { today: todayView, week: myWeekView, messages: messagesView },
    parent: { child: childView },
  };
  ROUTES.advisor = ROUTES.manager;

  async function render() {
    me = await Store.me();
    const [path, query] = location.hash.replace(/^#\/?/, "").split("?");
    const [name, arg] = path.split("/");
    if (!me) { loginView(); return; }
    const view = (ROUTES[me.role] || {})[name];
    if (!view) { location.replace(`#/${HOME[me.role]}`); return; }
    try {
      await view(name === "student" ? arg : new URLSearchParams(query || ""));
      window.scrollTo(0, 0);
    } catch (e) {
      toast(e.message, true);
      if (name !== HOME[me.role]) location.replace(`#/${HOME[me.role]}`);
    }
  }
  window.addEventListener("hashchange", render);
  render();
})();
