// لایه داده — نسخه نمایشی (ذخیره در مرورگر)
// همه صفحه‌ها فقط از طریق این توابع با داده کار می‌کنند و همه توابع async هستند.
// در نسخه سرور (لیارا) فقط بدنه همین توابع به درخواست‌های fetch به API تبدیل می‌شود.
// کنترل دسترسی‌ها هم همین‌جا انجام می‌شود، همان‌طور که بعداً در سرور انجام خواهد شد.
"use strict";

const Store = (() => {
  const DB_KEY = "khaksar-panel-demo-v1";
  const SESSION_KEY = "khaksar-panel-session";
  const INSTITUTE = "گروه مشاوره دکتر خاکسار";
  const SLEEP_MIN = 6, SLEEP_MAX = 9, PHONE_WARN = 2;

  let db = null;

  function load() {
    try { db = JSON.parse(localStorage.getItem(DB_KEY)); } catch { db = null; }
    if (!db || !Array.isArray(db.users)) { db = seed(); save(); }
    db.notes = db.notes || []; // داده‌های ذخیره‌شده از نسخه‌های قبل یادداشت ندارند
  }
  function save() {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) { console.warn("ذخیره نشد", e); }
  }
  function fail(message) { throw new Error(message); }
  const now = () => new Date().toISOString();

  // ---------- داده نمونه ----------
  function seed() {
    let s = 7;
    const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const d = { users: [], reports: [], tasks: [], feedback: [], parentMessages: [], notes: [], meta: { version: 1, seededAt: now() } };
    const add = (u) => { const user = { id: U.uid("u"), phone: "", createdAt: now(), ...u }; d.users.push(user); return user; };

    const manager = add({ role: "manager", name: "دکتر خاکسار", username: "admin", password: "1234" });
    const zilabi = add({ role: "advisor", name: "مهندس زیلابی", username: "zilabi", password: "1234" });
    const ahmadi = add({ role: "advisor", name: "استاد احمدی", username: "ahmadi", password: "1234" });
    const rezaei = add({ role: "supporter", name: "خانم رضایی", username: "rezaei", password: "1234", advisorId: zilabi.id });
    const karimi = add({ role: "supporter", name: "آقای کریمی", username: "karimi", password: "1234", advisorId: zilabi.id });
    const mousavi = add({ role: "supporter", name: "خانم موسوی", username: "mousavi", password: "1234", advisorId: ahmadi.id });

    const names = ["آرام آتشکده", "علی علوی", "مهسا رضایی", "سینا کریمی", "مریم حسینی", "نیما یوسفی", "زهرا احمدی",
      "امیر صادقی", "فاطمه نوری", "رضا محمدی", "سارا کاظمی", "حسین رحیمی", "نازنین قاسمی", "محمد جعفری"];
    const plan = [
      [manager, null], [manager, null],
      [zilabi, rezaei], [zilabi, rezaei], [zilabi, rezaei], [zilabi, karimi], [zilabi, karimi], [zilabi, karimi], [zilabi, null],
      [ahmadi, mousavi], [ahmadi, mousavi], [ahmadi, mousavi], [ahmadi, null], [ahmadi, null],
    ];
    const today = U.studyDay();
    names.forEach((name, i) => {
      const [adv, sup] = plan[i];
      const st = add({ role: "student", name, username: `s${1001 + i}`, password: "1234",
        advisorId: adv.id, supporterId: sup ? sup.id : null, phone: `0912${U.randomDigits(7)}` });
      if (i % 4 !== 3) add({ role: "parent", name: `ولی ${name}`, username: `p${1001 + i}`, password: "1234", studentId: st.id });
      const diligence = 0.55 + rand() * 0.45;
      // ۴ هفته داده نمونه تا گزارش ماهانه هم پر باشد
      U.lastDays(28).forEach((day, k) => {
        const isToday = day === today;
        if (rand() > diligence + 0.15) return; // روز بدون گزارش
        const th = [6, 7, 8, 8, 9, 10][Math.floor(rand() * 6)];
        const tt = [60, 80, 100, 120, 150][Math.floor(rand() * 5)];
        const r = { id: U.uid("r"), studentId: st.id, date: day, targetHours: th, targetTests: tt,
          sleep: Math.round((5 + rand() * 4) * 2) / 2, updatedAt: now() };
        // امروز: بعضی فقط هدف صبح دارند
        if (!(isToday && rand() < 0.4)) {
          r.doneHours = Math.round(th * (0.6 + rand() * 0.55) * 2) / 2;
          r.doneTests = Math.round(tt * (0.5 + rand() * 0.7) / 5) * 5;
          r.classHours = [0, 0, 1.5, 2, 3][Math.floor(rand() * 5)];
          r.phoneHours = Math.round((0.5 + rand() * 3.5) * 2) / 2;
        }
        d.reports.push(r);
        if (k >= 26) {
          ["زیست فصل ۲", "فیزیک حرکت‌شناسی", "۴۰ تست شیمی"].forEach((title, j) =>
            d.tasks.push({ id: U.uid("t"), studentId: st.id, date: day, title, done: rand() < 0.6 || j === 0 }));
        }
      });
    });
    const firstSt = d.users.find((u) => u.username === "s1003");
    d.feedback.push({ id: U.uid("f"), fromId: rezaei.id, studentId: firstSt.id, target: "student",
      text: "آفرین! این هفته منظم بودی، فقط زمان موبایل رو کمتر کن.", createdAt: now(), readAt: null });
    d.feedback.push({ id: U.uid("f"), fromId: rezaei.id, studentId: firstSt.id, target: "advisor",
      text: "مهسا این هفته از نظر مطالعه خوب بوده ولی خوابش کم است؛ پیشنهاد می‌کنم صحبت کنید.", createdAt: now(), readAt: null });
    d.parentMessages.push({ id: U.uid("m"), fromId: zilabi.id, studentId: firstSt.id, kind: "msg",
      text: "سلام، مهسا این هفته پیشرفت خوبی داشته. لطفاً روی ساعت خوابش نظارت داشته باشید.", createdAt: now(), seen: {} });
    return d;
  }

  // ---------- کمکی‌ها ----------
  const byId = (id) => db.users.find((u) => u.id === id) || null;
  const publicUser = (u) => u && ({ id: u.id, role: u.role, name: u.name, username: u.username, phone: u.phone || "",
    advisorId: u.advisorId || null, supporterId: u.supporterId || null, studentId: u.studentId || null });
  const reportOf = (studentId, day) => db.reports.find((r) => r.studentId === studentId && r.date === day) || null;
  const parentsOf = (studentId) => db.users.filter((u) => u.role === "parent" && u.studentId === studentId);
  const supportersOf = (advisorId) => db.users.filter((u) => u.role === "supporter" && u.advisorId === advisorId);

  function viewer() {
    const id = localStorage.getItem(SESSION_KEY);
    const u = id ? byId(id) : null;
    if (!u) fail("ابتدا وارد شوید.");
    return u;
  }
  const isStaff = (u) => ["manager", "advisor", "supporter"].includes(u.role);
  function canSee(v, st) {
    if (!st || st.role !== "student") return false;
    if (v.role === "manager") return true;
    if (v.role === "advisor") return st.advisorId === v.id;
    if (v.role === "supporter") return st.supporterId === v.id;
    if (v.role === "student") return st.id === v.id;
    if (v.role === "parent") return st.id === v.studentId;
    return false;
  }
  function studentFor(v, studentId) {
    const st = byId(studentId);
    if (!canSee(v, st)) fail("دسترسی به این شاگرد ندارید.");
    return st;
  }
  function requireRole(v, ...roles) {
    if (!roles.includes(v.role)) fail("دسترسی ندارید.");
  }
  function uniqueUsername(base) {
    let name = base, i = 2;
    while (db.users.some((u) => u.username === name)) name = `${base}${i++}`;
    return name;
  }
  function nextStudentUsername() {
    const nums = db.users.filter((u) => /^s\d+$/.test(u.username)).map((u) => Number(u.username.slice(1)));
    return `s${Math.max(1000, ...nums) + 1}`;
  }
  const newPassword = () => U.randomDigits(6);

  function streakOf(studentId) {
    const days = new Set(db.reports.filter((r) => r.studentId === studentId && r.doneHours != null).map((r) => r.date));
    let day = U.studyDay();
    if (!days.has(day)) day = U.addDays(day, -1);
    let n = 0;
    while (days.has(day)) { n++; day = U.addDays(day, -1); }
    return n;
  }

  function studentRow(st) {
    const adv = byId(st.advisorId), sup = st.supporterId ? byId(st.supporterId) : null;
    const today = reportOf(st.id, U.studyDay());
    return {
      ...publicUser(st), advisorName: adv ? adv.name : "-", supporterName: sup ? sup.name : null,
      today, streak: streakOf(st.id), parentCount: parentsOf(st.id).length,
      status: !today ? "none" : today.doneHours == null ? "goal" : today.doneHours >= today.targetHours ? "met" : "missed",
    };
  }

  // ---------- ورود ----------
  async function login(username, password) {
    load();
    const u = db.users.find((x) => x.username === U.toLatinDigits(username).trim().toLowerCase());
    if (!u || u.password !== U.toLatinDigits(password).trim()) fail("نام کاربری یا رمز عبور اشتباه است.");
    localStorage.setItem(SESSION_KEY, u.id);
    return publicUser(u);
  }
  async function logout() { localStorage.removeItem(SESSION_KEY); }
  async function me() {
    load();
    const id = localStorage.getItem(SESSION_KEY);
    return id && byId(id) ? publicUser(byId(id)) : null;
  }
  async function resetDemo() { localStorage.removeItem(DB_KEY); localStorage.removeItem(SESSION_KEY); load(); save(); }

  // ---------- کادر (مشاور و پشتیبان) ----------
  async function staff() {
    const v = viewer();
    requireRole(v, "manager", "advisor");
    const advisors = db.users.filter((u) => u.role === "manager" || u.role === "advisor")
      .filter((a) => v.role === "manager" || a.id === v.id);
    return advisors.map((a) => ({
      ...publicUser(a),
      studentCount: db.users.filter((u) => u.role === "student" && u.advisorId === a.id).length,
      supporters: supportersOf(a.id).map((s) => ({
        ...publicUser(s), studentCount: db.users.filter((u) => u.role === "student" && u.supporterId === s.id).length,
      })),
    }));
  }
  async function createStaff({ role, name, advisorId }) {
    const v = viewer();
    name = String(name || "").trim();
    if (!name) fail("نام را وارد کنید.");
    if (role === "advisor") requireRole(v, "manager");
    else if (role === "supporter") {
      requireRole(v, "manager", "advisor");
      if (v.role === "advisor") advisorId = v.id;
      const adv = byId(advisorId);
      if (!adv || !["manager", "advisor"].includes(adv.role)) fail("مشاور را انتخاب کنید.");
    } else fail("نقش نامعتبر است.");
    const password = newPassword();
    const user = { id: U.uid("u"), role, name, username: uniqueUsername(role === "advisor" ? "adv" + U.randomDigits(3) : "sup" + U.randomDigits(3)),
      password, advisorId: role === "supporter" ? advisorId : null, createdAt: now() };
    db.users.push(user);
    save();
    return { user: publicUser(user), password };
  }
  async function removeStaff(id) {
    const v = viewer();
    const target = byId(id);
    if (!target) fail("پیدا نشد.");
    if (target.role === "advisor") {
      requireRole(v, "manager");
      db.users.forEach((u) => {
        if (u.role === "student" && u.advisorId === id) u.advisorId = v.id;
        if (u.role === "supporter" && u.advisorId === id) u.advisorId = v.id;
      });
    } else if (target.role === "supporter") {
      if (!(v.role === "manager" || (v.role === "advisor" && target.advisorId === v.id))) fail("دسترسی ندارید.");
      db.users.forEach((u) => { if (u.role === "student" && u.supporterId === id) u.supporterId = null; });
    } else fail("فقط مشاور یا پشتیبان قابل حذف است.");
    db.users = db.users.filter((u) => u.id !== id);
    save();
  }
  async function resetPassword(userId) {
    const v = viewer();
    const u = byId(userId);
    if (!u) fail("پیدا نشد.");
    const allowed = v.role === "manager" ||
      (v.role === "advisor" && ((u.role === "supporter" && u.advisorId === v.id) ||
        (u.role === "student" && u.advisorId === v.id) || (u.role === "parent" && byId(u.studentId)?.advisorId === v.id)));
    if (!allowed || u.role === "manager") fail("دسترسی ندارید.");
    u.password = newPassword();
    save();
    return { user: publicUser(u), password: u.password };
  }

  // ---------- شاگردان ----------
  async function students() {
    const v = viewer();
    requireRole(v, "manager", "advisor", "supporter");
    return db.users.filter((u) => canSee(v, u)).map(studentRow).sort((a, b) => a.name.localeCompare(b.name, "fa"));
  }
  async function student(id) {
    const v = viewer();
    const st = studentFor(v, id);
    return { ...studentRow(st), parents: isStaff(v) ? parentsOf(id).map(publicUser) : [] };
  }

  // ردیف‌های ورودی: { name, phone, parentPhone, supporterName }
  async function bulkAddStudents({ advisorId, rows, distribute }) {
    const v = viewer();
    requireRole(v, "manager", "advisor");
    if (v.role === "advisor") advisorId = v.id;
    const adv = byId(advisorId);
    if (!adv || !["manager", "advisor"].includes(adv.role)) fail("مشاور را انتخاب کنید.");
    const sups = supportersOf(adv.id);
    const supLoad = new Map(sups.map((s) => [s.id, db.users.filter((u) => u.role === "student" && u.supporterId === s.id).length]));
    const results = [];
    for (const row of rows) {
      const name = String(row.name || "").trim();
      if (!name) continue;
      const phone = U.isMobile(U.normalizePhone(row.phone)) ? U.normalizePhone(row.phone) : "";
      let supporterId = null;
      if (row.supporterName) {
        const s = sups.find((x) => x.name.trim() === String(row.supporterName).trim());
        if (s) supporterId = s.id;
      }
      if (!supporterId && distribute && sups.length) {
        // تقسیم مساوی: به پشتیبانی که کمترین شاگرد را دارد
        supporterId = [...supLoad.entries()].sort((a, b) => a[1] - b[1])[0][0];
      }
      if (supporterId) supLoad.set(supporterId, (supLoad.get(supporterId) || 0) + 1);
      const username = phone && !db.users.some((u) => u.username === phone) ? phone : nextStudentUsername();
      const password = newPassword();
      const st = { id: U.uid("u"), role: "student", name, username, password, phone, advisorId: adv.id, supporterId, createdAt: now() };
      db.users.push(st);
      const parentPassword = newPassword();
      const parentPhone = U.isMobile(U.normalizePhone(row.parentPhone)) ? U.normalizePhone(row.parentPhone) : "";
      const parent = { id: U.uid("u"), role: "parent", name: `ولی ${name}`, phone: parentPhone, studentId: st.id, createdAt: now(),
        username: uniqueUsername(username.startsWith("s") ? "p" + username.slice(1) : "p" + username.slice(-6)), password: parentPassword };
      db.users.push(parent);
      results.push({
        name, phone, username, password, parentUsername: parent.username, parentPassword, parentPhone,
        supporterName: supporterId ? byId(supporterId).name : "",
      });
    }
    save();
    return results;
  }
  async function assignSupporter(ids, supporterId) {
    const v = viewer();
    requireRole(v, "manager", "advisor");
    const sup = supporterId ? byId(supporterId) : null;
    if (supporterId && (!sup || sup.role !== "supporter")) fail("پشتیبان پیدا نشد.");
    let changed = 0, skipped = 0;
    ids.forEach((id) => {
      const st = studentFor(v, id);
      // پشتیبان باید متعلق به مشاورِ همان شاگرد باشد
      if (sup && sup.advisorId !== st.advisorId) { skipped++; return; }
      st.supporterId = sup ? sup.id : null;
      changed++;
    });
    save();
    return { changed, skipped };
  }
  async function distributeToSupporters(ids) {
    const v = viewer();
    requireRole(v, "manager", "advisor");
    const counts = {};
    let skipped = 0;
    const groups = new Map();
    ids.map((id) => studentFor(v, id)).forEach((st) => {
      if (!groups.has(st.advisorId)) groups.set(st.advisorId, []);
      groups.get(st.advisorId).push(st);
    });
    groups.forEach((list, advId) => {
      const sups = supportersOf(advId);
      if (!sups.length) { skipped += list.length; return; }
      list.forEach((st, i) => { st.supporterId = sups[i % sups.length].id; counts[sups[i % sups.length].name] = (counts[sups[i % sups.length].name] || 0) + 1; });
    });
    save();
    return { counts, skipped };
  }
  async function moveStudents(ids, advisorId) {
    const v = viewer();
    requireRole(v, "manager");
    const adv = byId(advisorId);
    if (!adv || !["manager", "advisor"].includes(adv.role)) fail("مشاور پیدا نشد.");
    ids.forEach((id) => {
      const st = studentFor(v, id);
      if (st.advisorId !== adv.id) { st.advisorId = adv.id; st.supporterId = null; }
    });
    save();
  }
  async function deleteStudents(ids) {
    const v = viewer();
    requireRole(v, "manager", "advisor");
    const set = new Set(ids.map((id) => studentFor(v, id).id));
    db.users = db.users.filter((u) => !set.has(u.id) && !(u.role === "parent" && set.has(u.studentId)));
    db.reports = db.reports.filter((r) => !set.has(r.studentId));
    db.tasks = db.tasks.filter((t) => !set.has(t.studentId));
    db.feedback = db.feedback.filter((f) => !set.has(f.studentId));
    db.parentMessages = db.parentMessages.filter((m) => !set.has(m.studentId));
    db.notes = db.notes.filter((n) => !set.has(n.studentId));
    save();
    return set.size;
  }
  async function resetStudentPasswords(ids) {
    const v = viewer();
    requireRole(v, "manager", "advisor");
    const out = ids.map((id) => {
      const st = studentFor(v, id);
      st.password = newPassword();
      const parent = parentsOf(st.id)[0];
      if (parent) parent.password = newPassword();
      return { name: st.name, phone: st.phone, username: st.username, password: st.password,
        parentUsername: parent ? parent.username : "", parentPassword: parent ? parent.password : "", parentPhone: parent ? parent.phone : "" };
    });
    save();
    return out;
  }

  // ---------- گزارش روزانه شاگرد ----------
  async function myDay() {
    const v = viewer();
    requireRole(v, "student");
    const day = U.studyDay();
    return { day, report: reportOf(v.id, day), tasks: db.tasks.filter((t) => t.studentId === v.id && t.date === day), streak: streakOf(v.id) };
  }
  function upsertReport(studentId, day, patch) {
    let r = reportOf(studentId, day);
    if (!r) { r = { id: U.uid("r"), studentId, date: day }; db.reports.push(r); }
    Object.assign(r, patch, { updatedAt: now() });
    return r;
  }
  function checkHours(x, label) {
    if (!Number.isFinite(x) || x < 0 || x > 24) fail(`${label} باید عددی بین ۰ تا ۲۴ باشد.`);
  }
  async function saveMorning({ targetHours, targetTests, sleep }) {
    const v = viewer();
    requireRole(v, "student");
    checkHours(targetHours, "هدف ساعت مطالعه");
    checkHours(sleep, "ساعت خواب");
    if (!Number.isInteger(targetTests) || targetTests < 0) fail("هدف تست باید عدد صحیح باشد.");
    const r = upsertReport(v.id, U.studyDay(), { targetHours, targetTests, sleep });
    save();
    return r;
  }
  async function saveNight({ doneHours, doneTests, classHours, phoneHours }) {
    const v = viewer();
    requireRole(v, "student");
    const day = U.studyDay();
    const r0 = reportOf(v.id, day);
    if (!r0 || r0.targetHours == null) fail("اول هدف صبحگاهی امروز را ثبت کنید.");
    checkHours(doneHours, "ساعت مطالعه");
    checkHours(classHours, "ساعت کلاس");
    checkHours(phoneHours, "ساعت موبایل");
    if (!Number.isInteger(doneTests) || doneTests < 0) fail("تعداد تست باید عدد صحیح باشد.");
    const r = upsertReport(v.id, day, { doneHours, doneTests, classHours, phoneHours });
    save();
    return r;
  }
  async function addTask(title) {
    const v = viewer();
    requireRole(v, "student");
    title = String(title || "").trim();
    if (!title) fail("عنوان را بنویسید.");
    const t = { id: U.uid("t"), studentId: v.id, date: U.studyDay(), title, done: false };
    db.tasks.push(t);
    save();
    return t;
  }
  async function toggleTask(id) {
    const v = viewer();
    const t = db.tasks.find((x) => x.id === id && x.studentId === v.id && x.date === U.studyDay());
    if (!t) fail("این تسک مربوط به امروز نیست.");
    t.done = !t.done;
    save();
    return t;
  }
  async function deleteTask(id) {
    const v = viewer();
    db.tasks = db.tasks.filter((x) => !(x.id === id && x.studentId === v.id));
    save();
  }

  // ---------- سابقه و خلاصه هفتگی ----------
  async function history(studentId, n = 7) {
    const v = viewer();
    const st = studentFor(v, studentId);
    return U.lastDays(n).reverse().map((day) => {
      const tasks = db.tasks.filter((t) => t.studentId === st.id && t.date === day);
      return { day, report: reportOf(st.id, day), tasksTotal: tasks.length, tasksDone: tasks.filter((t) => t.done).length };
    });
  }
  async function week(studentId) {
    const v = viewer();
    const st = studentFor(v, studentId);
    const days = U.lastDays(7).map((day) => ({ day, report: reportOf(st.id, day) }));
    const done = days.filter((d) => d.report && d.report.doneHours != null);
    const sum = (arr, k) => arr.reduce((s, d) => s + (d.report[k] || 0), 0);
    const avg = (k) => {
      const vals = days.filter((d) => d.report && d.report[k] != null);
      return vals.length ? Math.round((sum(vals, k) / vals.length) * 10) / 10 : null;
    };
    const totalHours = Math.round(sum(done, "doneHours") * 10) / 10;
    const targetHours = done.reduce((s, d) => s + (d.report.targetHours || 0), 0);
    const classVals = days.filter((d) => d.report && d.report.classHours != null);
    return {
      student: publicUser(st), days, totalHours, targetHours, totalTests: sum(done, "doneTests"),
      activeDays: done.length, avgHours: done.length ? Math.round((totalHours / done.length) * 10) / 10 : 0,
      avgSleep: avg("sleep"), avgPhone: avg("phoneHours"),
      totalClass: classVals.length ? Math.round(sum(classVals, "classHours") * 10) / 10 : null,
      streak: streakOf(st.id), limits: { SLEEP_MIN, SLEEP_MAX, PHONE_WARN },
    };
  }
  // گزارش ماهانه: ۴ هفته اخیر (۲۸ روز)، هر هفته جمع مطالعه و تست و میانگین خواب و موبایل
  async function month(studentId) {
    const v = viewer();
    const st = studentFor(v, studentId);
    const days = U.lastDays(28);
    const summarize = (list) => {
      const rs = list.map((d) => reportOf(st.id, d)).filter(Boolean);
      const done = rs.filter((r) => r.doneHours != null);
      const avg = (arr, k) => { const vals = arr.filter((r) => r[k] != null); return vals.length ? Math.round(vals.reduce((s, r) => s + r[k], 0) / vals.length * 10) / 10 : null; };
      const sum = (k) => Math.round(done.reduce((s, r) => s + (r[k] || 0), 0) * 10) / 10;
      return { study: sum("doneHours"), target: sum("targetHours"), tests: sum("doneTests"), class: sum("classHours"),
        sleep: avg(rs, "sleep"), phone: avg(done, "phoneHours"), days: done.length };
    };
    const weeks = [0, 1, 2, 3].map((w) => {
      const list = days.slice(w * 7, w * 7 + 7);
      return { start: list[0], end: list[6], ...summarize(list) };
    });
    const adv = byId(st.advisorId);
    return { student: publicUser(st), advisorName: adv ? adv.name : "-", first: days[0], last: days[27],
      weeks, total: summarize(days), limits: { SLEEP_MIN, SLEEP_MAX, PHONE_WARN } };
  }

  // ---------- یادداشت محرمانه: فقط نویسنده‌اش می‌بیند (حتی مدیر یادداشت مشاور دیگر را نمی‌بیند) ----------
  async function myNotes(studentId) {
    const v = viewer();
    requireRole(v, "manager", "advisor");
    studentFor(v, studentId);
    return db.notes.filter((n) => n.studentId === studentId && n.authorId === v.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async function addNote(studentId, text) {
    const v = viewer();
    requireRole(v, "manager", "advisor");
    studentFor(v, studentId);
    text = String(text || "").trim();
    if (!text) fail("متن یادداشت را بنویسید.");
    const n = { id: U.uid("n"), authorId: v.id, studentId, text, createdAt: now() };
    db.notes.push(n);
    save();
    return n;
  }
  async function deleteNote(id) {
    const v = viewer();
    const before = db.notes.length;
    db.notes = db.notes.filter((n) => !(n.id === id && n.authorId === v.id));
    if (db.notes.length === before) fail("یادداشت پیدا نشد.");
    save();
  }

  async function overview() {
    const v = viewer();
    requireRole(v, "manager", "advisor", "supporter");
    const list = db.users.filter((u) => canSee(v, u)).map(studentRow);
    const count = (s) => list.filter((x) => x.status === s).length;
    const byAdvisor = v.role !== "manager" ? [] : db.users.filter((u) => u.role === "manager" || u.role === "advisor").map((a) => {
      const mine = list.filter((x) => x.advisorId === a.id);
      return { id: a.id, name: a.name, total: mine.length, reported: mine.filter((x) => x.status === "met" || x.status === "missed").length };
    });
    return {
      total: list.length, met: count("met"), missed: count("missed"), goalOnly: count("goal"), none: count("none"),
      missing: list.filter((x) => x.status === "none" || x.status === "goal"),
      unread: (await inbox()).filter((f) => !f.readAt).length, byAdvisor,
    };
  }

  // ---------- بازخورد پشتیبان/مشاور ----------
  async function sendFeedback(studentId, target, text) {
    const v = viewer();
    requireRole(v, "manager", "advisor", "supporter");
    studentFor(v, studentId);
    text = String(text || "").trim();
    if (!text) fail("متن را بنویسید.");
    if (target === "advisor" && v.role !== "supporter") fail("گزارش به مشاور فقط برای پشتیبان است.");
    if (!["student", "advisor"].includes(target)) fail("مقصد نامعتبر است.");
    const f = { id: U.uid("f"), fromId: v.id, studentId, target, text, createdAt: now(), readAt: null };
    db.feedback.push(f);
    save();
    return f;
  }
  const feedbackView = (f) => ({ ...f, fromName: byId(f.fromId)?.name || "-", fromRole: byId(f.fromId)?.role || "",
    studentName: byId(f.studentId)?.name || "-" });
  async function feedbackFor(studentId) {
    const v = viewer();
    studentFor(v, studentId);
    return db.feedback.filter((f) => f.studentId === studentId && (isStaff(v) || f.target === "student"))
      .map(feedbackView).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async function inbox() {
    // گزارش‌های پشتیبان‌ها به مشاور، درباره شاگردانی که مشاور می‌بیند
    const v = viewer();
    if (!["manager", "advisor"].includes(v.role)) return [];
    return db.feedback.filter((f) => f.target === "advisor" && byId(f.studentId)?.advisorId === v.id)
      .map(feedbackView).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async function markRead(feedbackId) {
    const v = viewer();
    const f = db.feedback.find((x) => x.id === feedbackId);
    if (!f) return;
    const st = byId(f.studentId);
    const mine = (f.target === "student" && v.id === f.studentId) || (f.target === "advisor" && st?.advisorId === v.id);
    if (mine && !f.readAt) { f.readAt = now(); save(); }
  }
  async function myFeedback() {
    const v = viewer();
    requireRole(v, "student");
    return db.feedback.filter((f) => f.studentId === v.id && f.target === "student")
      .map(feedbackView).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // ---------- پیام به اولیا ----------
  async function sendParentMessage(studentId, text, kind = "msg") {
    const v = viewer();
    requireRole(v, "manager", "advisor");
    studentFor(v, studentId);
    text = String(text || "").trim();
    if (kind === "msg" && !text) fail("متن پیام را بنویسید.");
    if (!parentsOf(studentId).length) fail("برای این شاگرد هنوز حساب ولی ساخته نشده.");
    const m = { id: U.uid("m"), fromId: v.id, studentId, kind, text, createdAt: now(), seen: {} };
    db.parentMessages.push(m);
    save();
    return m;
  }
  async function parentMessagesFor(studentId) {
    const v = viewer();
    studentFor(v, studentId);
    const parents = parentsOf(studentId);
    return db.parentMessages.filter((m) => m.studentId === studentId).map((m) => ({
      ...m, fromName: byId(m.fromId)?.name || "-",
      seenCount: parents.filter((p) => m.seen[p.id]).length, parentCount: parents.length,
    })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async function myChild() {
    const v = viewer();
    requireRole(v, "parent");
    const st = byId(v.studentId);
    if (!st) fail("حساب شاگرد پیدا نشد.");
    const messages = db.parentMessages.filter((m) => m.studentId === st.id).map((m) => ({
      ...m, fromName: byId(m.fromId)?.name || "-", seenByMe: !!m.seen[v.id],
    })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { student: publicUser(st), messages };
  }
  async function ackParentMessage(id) {
    const v = viewer();
    requireRole(v, "parent");
    const m = db.parentMessages.find((x) => x.id === id && x.studentId === v.studentId);
    if (m && !m.seen[v.id]) { m.seen[v.id] = now(); save(); }
  }

  load();
  return {
    INSTITUTE, login, logout, me, resetDemo,
    staff, createStaff, removeStaff, resetPassword,
    students, student, bulkAddStudents, assignSupporter, distributeToSupporters, moveStudents, deleteStudents, resetStudentPasswords,
    myDay, saveMorning, saveNight, addTask, toggleTask, deleteTask,
    history, week, month, overview, myNotes, addNote, deleteNote,
    sendFeedback, feedbackFor, inbox, markRead, myFeedback,
    sendParentMessage, parentMessagesFor, myChild, ackParentMessage,
  };
})();
