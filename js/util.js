// ابزارهای مشترک: اعداد فارسی، تاریخ شمسی، روز مطالعاتی، CSV و دانلود فایل
"use strict";

const U = (() => {
  const TZ = "Asia/Tehran";
  // روز مطالعاتی تا این ساعت بامداد ادامه دارد (مثل ربات)
  const DAY_CUTOFF_HOUR = 4;

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  const FA = "۰۱۲۳۴۵۶۷۸۹";
  function faNum(value) {
    if (value === null || value === undefined || value === "" || Number.isNaN(value)) return "–";
    let s = typeof value === "number" ? String(Math.round(value * 10) / 10) : String(value);
    return s.replace(/\d/g, (d) => FA[d]).replace(/\./g, "٫");
  }

  // ورودی کاربر: ارقام فارسی/عربی و ممیز فارسی (۷٫۵) یا اسلش (7/5)
  function toLatinDigits(s) {
    return String(s ?? "")
      .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
      .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
  }
  function parseNum(s) {
    const t = toLatinDigits(s).trim().replace(/[٫/,،]/g, ".");
    if (t === "" || !/^-?\d*\.?\d+$/.test(t)) return NaN;
    return Number(t);
  }
  function normalizePhone(s) {
    let t = toLatinDigits(s).replace(/[\s\-()]/g, "");
    if (t.startsWith("+98")) t = "0" + t.slice(3);
    else if (t.startsWith("0098")) t = "0" + t.slice(4);
    else if (t.startsWith("98") && t.length === 12) t = "0" + t.slice(2);
    else if (t.startsWith("9") && t.length === 10) t = "0" + t;
    return t;
  }
  const isMobile = (s) => /^09\d{9}$/.test(s);

  // --- تاریخ: همه روزها به‌صورت رشته YYYY-MM-DD ---
  function tehranParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
    }).formatToParts(date);
    const get = (t) => Number(parts.find((p) => p.type === t).value);
    return { y: get("year"), m: get("month"), d: get("day"), h: get("hour") };
  }
  function iso(y, m, d) {
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  function addDays(isoDay, n) {
    const [y, m, d] = isoDay.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + n));
    return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  function studyDay(date = new Date()) {
    const p = tehranParts(date);
    const today = iso(p.y, p.m, p.d);
    return p.h < DAY_CUTOFF_HOUR ? addDays(today, -1) : today;
  }
  function lastDays(n, end = studyDay()) {
    // از قدیمی به جدید
    return Array.from({ length: n }, (_, i) => addDays(end, i - n + 1));
  }
  function dayDate(isoDay) {
    const [y, m, d] = isoDay.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12));
  }
  function faDate(isoDay, opts = { day: "numeric", month: "long" }) {
    return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "UTC", ...opts }).format(dayDate(isoDay));
  }
  const weekday = (isoDay) => faDate(isoDay, { weekday: "long" });
  const weekdayShort = (isoDay) => faDate(isoDay, { weekday: "short" });
  function faDateTime(isoString) {
    return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      timeZone: TZ, month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
    }).format(new Date(isoString));
  }

  function uid(prefix = "") {
    const a = new Uint32Array(2);
    crypto.getRandomValues(a);
    return prefix + a[0].toString(36) + a[1].toString(36);
  }
  function randomDigits(n) {
    const a = new Uint32Array(n);
    crypto.getRandomValues(a);
    return Array.from(a, (x) => x % 10).join("");
  }

  // --- CSV / متن کپی‌شده از اکسل (جداکننده: تب، کاما یا ؛) ---
  function parseTable(text) {
    const lines = String(text).replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim() !== "");
    if (!lines.length) return [];
    const sample = lines[0];
    const sep = sample.includes("\t") ? "\t" : sample.includes(";") ? ";" : sample.includes("،") && !sample.includes(",") ? "،" : ",";
    return lines.map((line) => splitCsvLine(line, sep).map((c) => c.trim()));
  }
  function splitCsvLine(line, sep) {
    const out = [];
    let cur = "", quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === sep) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }
  function toCsv(rows) {
    return rows.map((r) => r.map((c) => {
      const s = String(c ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")).join("\r\n");
  }
  function download(filename, text, mime = "text/csv;charset=utf-8") {
    // BOM تا اکسل حروف فارسی را درست نشان دهد
    const blob = new Blob(["﻿" + text], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  return {
    esc, faNum, parseNum, toLatinDigits, normalizePhone, isMobile,
    studyDay, addDays, lastDays, faDate, weekday, weekdayShort, faDateTime,
    uid, randomDigits, parseTable, toCsv, download,
  };
})();
