/* Connection Group Site — single-page app (no build step needed). */
(() => {
"use strict";

// ---------- Setup -------------------------------------------------------
const cfg = window.CONFIG || {};
const app = document.getElementById("app");
if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("YOUR-PROJECT")) {
  app.innerHTML = `<div class="card auth"><h1>Almost there</h1>
    <p>Open <code>js/config.js</code> and paste in your Supabase URL and anon key (see README step 3).</p></div>`;
  return;
}
const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
const state = { session: null, me: null, settings: null, calMonth: null };
const BASE_URL = location.origin + location.pathname;

// ---------- Helpers -----------------------------------------------------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const md = (s) => DOMPurify.sanitize(marked.parse(s || ""));
const pad = (n) => String(n).padStart(2, "0");
const isOfficer = () => state.me?.role === "officer";
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const safeUrl = (u) => { if (!u) return ""; const s = /^https?:\/\//i.test(u) ? u : "https://" + u; return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : ""; };

function toast(msg, isErr = false) {
  const t = $("#toast");
  t.textContent = msg; t.className = "toast" + (isErr ? " err" : ""); t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), isErr ? 5000 : 2500);
}
function fail(error) { console.error(error); toast(error?.message || String(error), true); }

function openModal(html) { $("#modalBox").innerHTML = html; $("#modal").hidden = false; return $("#modalBox"); }
function closeModal() { $("#modal").hidden = true; $("#modalBox").innerHTML = ""; }
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal" || e.target.matches("[data-close]")) closeModal(); });

const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const fmtTime = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const fmtRange = (e) => `${fmtDate(e.starts_at)} · ${fmtTime(e.starts_at)}${e.ends_at ? " – " + fmtTime(e.ends_at) : ""}`;
const toLocalInput = (iso) => { if (!iso) return ""; const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);
const money = (n) => (n == null || n === "" ? "" : "$" + Number(n).toFixed(2));
const endOf = (e) => e.ends_at || new Date(new Date(e.starts_at).getTime() + 3600e3).toISOString();

function formData(form) {
  const o = {};
  for (const [k, v] of new FormData(form)) o[k] = typeof v === "string" ? v.trim() : v;
  for (const k in o) if (o[k] === "") o[k] = null;
  return o;
}

// ---------- Calendar export --------------------------------------------
const icsDate = (iso) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
const fold = (line) => { const out = []; while (line.length > 74) { out.push(line.slice(0, 74)); line = " " + line.slice(74); } out.push(line); return out.join("\r\n"); };
function eventDetails(e) {
  return [e.speaker_name && `Speaker: ${e.speaker_name}${e.speaker_business ? " (" + e.speaker_business + ")" : ""}`, e.description].filter(Boolean).join("\n\n");
}
function buildICS(events) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Connection Group//Members Site//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  const stamp = icsDate(new Date().toISOString());
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.id}@connection-group`, `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(e.starts_at)}`, `DTEND:${icsDate(endOf(e))}`,
      `SUMMARY:${icsText(e.title)}`);
    if (e.location) lines.push(`LOCATION:${icsText(e.location)}`);
    const d = eventDetails(e); if (d) lines.push(`DESCRIPTION:${icsText(d)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
function download(filename, text, type = "text/calendar") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function googleLink(e) {
  const p = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates: `${icsDate(e.starts_at)}/${icsDate(endOf(e))}`, details: eventDetails(e), location: e.location || "" });
  return "https://calendar.google.com/calendar/render?" + p.toString();
}

// ---------- Data --------------------------------------------------------
async function loadMe(force = false) {
  const email = state.session?.user?.email?.toLowerCase();
  if (!email) { state.me = null; return; }
  if (!force && state.me?.email === email) return;
  const { data, error } = await sb.from("members").select("*").eq("email", email).maybeSingle();
  if (error) fail(error);
  state.me = data && data.active ? data : null;
}
async function loadSettings(force = false) {
  if (state.settings && !force) return state.settings;
  const { data, error } = await sb.from("site_settings").select("*").eq("id", 1).maybeSingle();
  if (error) fail(error);
  state.settings = data || {};
  return state.settings;
}
async function getEvents({ upcoming = false } = {}) {
  let q = sb.from("events").select("*").order("starts_at");
  if (upcoming) q = q.gte("starts_at", new Date(Date.now() - 3 * 3600e3).toISOString());
  const { data, error } = await q; if (error) fail(error); return data || [];
}

// ---------- Router ------------------------------------------------------
const PUBLIC = { login: viewLogin, signup: viewSignup, forgot: viewForgot };
const PRIVATE = { dashboard: viewDashboard, members: viewMembers, calendar: viewCalendar, policies: viewPolicies, dues: viewDues, profile: viewProfile, reset: viewReset, admin: viewAdmin };
let renderId = 0;

async function route() {
  const id = ++renderId;
  const [path, sub] = location.hash.replace(/^#\/?/, "").split("/");
  const page = path || "dashboard";
  closeModal(); $("#nav").classList.remove("open");

  if (!state.session) {
    $("#topbar").hidden = true;
    return (PUBLIC[page] || viewLogin)();
  }
  if (PUBLIC[page]) { location.hash = "#/dashboard"; return; }
  await loadMe();
  if (id !== renderId) return;
  if (!state.me) {
    $("#topbar").hidden = true;
    app.innerHTML = `<div class="card auth"><h1>No access</h1><p>${esc(state.session.user.email)} isn't on the active member list. Ask an officer to add you.</p><button class="btn" id="so">Sign out</button></div>`;
    $("#so").onclick = signOut; return;
  }
  await loadSettings();
  if (id !== renderId) return;
  renderNav(page);
  const view = PRIVATE[page] || viewDashboard;
  if (page === "admin" && !isOfficer()) { location.hash = "#/dashboard"; return; }
  app.innerHTML = `<p class="muted">Loading…</p>`;
  try { await view(sub); } catch (e) { fail(e); }
  window.scrollTo(0, 0);
}

function renderNav(page) {
  const name = state.settings?.group_name || "Members";
  document.title = name; $("#brand").textContent = name;
  const links = [["dashboard", "Dashboard"], ["members", "Members"], ["calendar", "Calendar"], ["policies", "Policies"], ["dues", "Dues"], ["profile", "My Profile"]];
  if (isOfficer()) links.push(["admin", "Admin"]);
  $("#nav").innerHTML = links.map(([k, l]) => `<a href="#/${k}" class="${k === page ? "active" : ""}">${l}</a>`).join("") + `<button id="signout">Sign out</button>`;
  $("#signout").onclick = signOut;
  $("#topbar").hidden = false;
}
$("#menuBtn").onclick = () => $("#nav").classList.toggle("open");

async function signOut() { await sb.auth.signOut(); state.me = null; state.settings = null; location.hash = "#/login"; }

// ---------- Auth views --------------------------------------------------
function authShell(title, body) {
  app.innerHTML = `<div class="card auth"><h1>${title}</h1>${body}</div>`;
}
function viewLogin() {
  authShell("Member Sign In", `
    <form id="f"><div class="field"><label>Email</label><input name="email" type="email" required autocomplete="email"></div>
    <div class="field"><label>Password</label><input name="password" type="password" required autocomplete="current-password"></div>
    <button class="btn" style="width:100%">Sign in</button></form>
    <p class="small" style="text-align:center;margin-top:16px"><a href="#/signup">First time? Create your password</a> · <a href="#/forgot">Forgot password</a></p>`);
  $("#f").onsubmit = async (e) => {
    e.preventDefault(); const { email, password } = formData(e.target);
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) fail(error.message.includes("Email not confirmed") ? { message: "Please click the confirmation link we emailed you first." } : error);
  };
}
function viewSignup() {
  authShell("Create Your Login", `
    <p class="small muted">Use the email address the group has on file for you.</p>
    <form id="f"><div class="field"><label>Email</label><input name="email" type="email" required></div>
    <div class="field"><label>Choose a password (8+ characters)</label><input name="password" type="password" minlength="8" required autocomplete="new-password"></div>
    <div class="field"><label>Confirm password</label><input name="password2" type="password" minlength="8" required></div>
    <button class="btn" style="width:100%">Create login</button></form>
    <p class="small" style="text-align:center;margin-top:16px"><a href="#/login">Back to sign in</a></p>`);
  $("#f").onsubmit = async (e) => {
    e.preventDefault(); const { email, password, password2 } = formData(e.target);
    if (password !== password2) return toast("Passwords don't match", true);
    const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: BASE_URL } });
    if (error) return fail(/database error|not on the member list/i.test(error.message) ? { message: "That email isn't on the member list. Ask an officer to add you, or try the email you gave the group." } : error);
    if (!data.session) authShell("Check your email", `<p>We sent a confirmation link to <b>${esc(email)}</b>. Click it, then sign in.</p><p><a href="#/login">Back to sign in</a></p>`);
  };
}
function viewForgot() {
  authShell("Reset Password", `
    <form id="f"><div class="field"><label>Email</label><input name="email" type="email" required></div>
    <button class="btn" style="width:100%">Send reset link</button></form>
    <p class="small" style="text-align:center;margin-top:16px"><a href="#/login">Back to sign in</a></p>`);
  $("#f").onsubmit = async (e) => {
    e.preventDefault(); const { email } = formData(e.target);
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: BASE_URL });
    if (error) return fail(error);
    authShell("Check your email", `<p>If <b>${esc(email)}</b> has a login, a reset link is on its way.</p>`);
  };
}
function viewReset() {
  app.innerHTML = `<div class="card auth"><h1>Set a New Password</h1>
    <form id="f"><div class="field"><label>New password</label><input name="password" type="password" minlength="8" required autocomplete="new-password"></div>
    <button class="btn" style="width:100%">Save password</button></form></div>`;
  $("#f").onsubmit = async (e) => {
    e.preventDefault(); const { error } = await sb.auth.updateUser({ password: formData(e.target).password });
    if (error) return fail(error); toast("Password updated"); location.hash = "#/dashboard";
  };
}

// ---------- Dashboard ---------------------------------------------------
function eventItem(e) {
  const d = new Date(e.starts_at);
  return `<div class="event-item">
    <div class="date-chip"><div class="m">${d.toLocaleDateString(undefined, { month: "short" })}</div><div class="d">${d.getDate()}</div></div>
    <div><b>${esc(e.title)}</b><div class="small muted">${fmtRange(e)}${e.location ? " · " + esc(e.location) : ""}</div>
    ${e.speaker_name ? `<div class="small">Speaker: ${esc(e.speaker_name)}${e.speaker_business ? " — " + esc(e.speaker_business) : ""}</div>` : ""}
    <div class="row small" style="margin-top:4px"><a href="${esc(googleLink(e))}" target="_blank" rel="noopener">Add to Google</a><a href="#" data-ics="${e.id}">Download .ics</a></div></div></div>`;
}
function bindIcs(root, events) {
  $$("[data-ics]", root).forEach((a) => (a.onclick = (ev) => {
    ev.preventDefault(); const e = events.find((x) => x.id === a.dataset.ics);
    download(`${e.title.replace(/[^\w]+/g, "-")}.ics`, buildICS([e]));
  }));
}
async function myDuesRow(period) {
  const { data } = await sb.from("dues").select("*").eq("member_id", state.me.id).eq("period", period).maybeSingle();
  return data;
}
function duesStatusHtml(row, s) {
  const paid = row?.paid;
  const amt = row?.amount ?? s.dues_amount;
  return `<div class="big-status">${paid ? `<span class="badge ok">PAID</span>` : `<span class="badge bad">UNPAID</span>`} <span class="small muted">${esc(s.dues_period || "")} dues${amt ? " · " + money(amt) : ""}</span></div>
    ${paid ? `<p class="small muted">Paid${row.paid_on ? " on " + new Date(row.paid_on + "T12:00").toLocaleDateString() : ""}. Thank you!</p>`
      : safeUrl(s.cashapp_url) ? `<p><a class="btn cash" href="${esc(safeUrl(s.cashapp_url))}" target="_blank" rel="noopener">Pay with Cash App</a></p><p class="small muted">After you pay, the treasurer will mark you as paid.</p>` : `<p class="small muted">Ask an officer how to pay.</p>`}`;
}
async function viewDashboard() {
  const s = state.settings;
  const [events, dues] = await Promise.all([getEvents({ upcoming: true }), myDuesRow(s.dues_period)]);
  const next = events.slice(0, 3);
  app.innerHTML = `<h1>Welcome, ${esc(state.me.full_name.split(" ")[0])}</h1>
  <div class="grid-2">
    <div class="card stack"><h2>Upcoming meetings</h2>${next.length ? next.map(eventItem).join("") : `<p class="muted">Nothing scheduled yet.</p>`}<a href="#/calendar">Full calendar →</a></div>
    <div class="stack">
      <div class="card"><h2>My dues</h2>${duesStatusHtml(dues, s)}</div>
      <div class="card md">${md(s.welcome_md)}</div>
    </div>
  </div>`;
  bindIcs(app, next);
}

// ---------- Members directory -------------------------------------------
function memberCard(m) {
  const site = safeUrl(m.website);
  return `<div class="card member-card">
    <h3>${esc(m.full_name)} ${m.role === "officer" ? `<span class="badge">Officer</span>` : ""}</h3>
    <div class="biz">${esc([m.business, m.industry].filter(Boolean).join(" · "))}</div>
    ${m.phone ? `<p>📞 <a href="tel:${esc(m.phone.replace(/[^\d+]/g, ""))}">${esc(m.phone)}</a></p>` : ""}
    <p>✉️ <a href="mailto:${esc(m.email)}">${esc(m.email)}</a></p>
    ${site ? `<p>🌐 <a href="${esc(site)}" target="_blank" rel="noopener">${esc(m.website.replace(/^https?:\/\//, ""))}</a></p>` : ""}
    ${m.bio ? `<p class="muted small">${esc(m.bio)}</p>` : ""}</div>`;
}
async function viewMembers() {
  const { data, error } = await sb.from("members").select("*").eq("active", true).order("full_name");
  if (error) return fail(error);
  app.innerHTML = `<div class="row spread"><h1>Member Directory <span class="muted small">(${data.length})</span></h1>
    <div class="row"><input id="q" placeholder="Search name, business, industry…" style="width:260px"><button class="btn ghost" id="csv">Export CSV</button></div></div>
    <div class="grid" id="list"></div>`;
  const draw = (q = "") => {
    const t = q.toLowerCase();
    const rows = data.filter((m) => [m.full_name, m.business, m.industry, m.email].join(" ").toLowerCase().includes(t));
    $("#list").innerHTML = rows.map(memberCard).join("") || `<p class="muted">No matches.</p>`;
  };
  draw(); $("#q").oninput = (e) => draw(e.target.value);
  $("#csv").onclick = () => {
    const cols = ["full_name", "business", "industry", "phone", "email", "website"];
    const csv = [cols.join(","), ...data.map((m) => cols.map((c) => `"${String(m[c] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    download("members.csv", csv, "text/csv");
  };
}

// ---------- Profile -----------------------------------------------------
async function viewProfile() {
  const m = state.me;
  app.innerHTML = `<h1>My Profile</h1><div class="card" style="max-width:640px"><form id="f">
    <div class="fields-2">
      <div class="field"><label>Full name</label><input name="full_name" value="${esc(m.full_name)}" required></div>
      <div class="field"><label>Phone</label><input name="phone" value="${esc(m.phone)}"></div>
      <div class="field"><label>Business</label><input name="business" value="${esc(m.business)}"></div>
      <div class="field"><label>Industry</label><input name="industry" value="${esc(m.industry)}"></div>
    </div>
    <div class="field"><label>Website</label><input name="website" value="${esc(m.website)}"></div>
    <div class="field"><label>Short bio / what you're looking for</label><textarea name="bio">${esc(m.bio)}</textarea></div>
    <p class="small muted">Email: ${esc(m.email)} (an officer can change this)</p>
    <div class="row"><button class="btn">Save</button><a href="#/reset">Change password</a></div></form></div>`;
  $("#f").onsubmit = async (e) => {
    e.preventDefault();
    const { error } = await sb.from("members").update(formData(e.target)).eq("id", m.id);
    if (error) return fail(error); await loadMe(true); toast("Profile saved");
  };
}

// ---------- Calendar ----------------------------------------------------
async function viewCalendar(mode) {
  const events = await getEvents();
  const now = new Date();
  state.calMonth ||= new Date(now.getFullYear(), now.getMonth(), 1);
  const upcoming = events.filter((e) => new Date(endOf(e)) >= now);
  const isList = mode === "list";
  app.innerHTML = `<div class="row spread"><h1>Meeting Calendar</h1>
    <div class="row"><div class="tabs" style="margin:0"><a href="#/calendar" class="${isList ? "" : "active"}">Month</a><a href="#/calendar/list" class="${isList ? "active" : ""}">List</a></div>
    <button class="btn ghost" id="expAll">Export all upcoming (.ics)</button></div></div>
    <div id="calBody"></div>`;
  $("#expAll").onclick = () => upcoming.length ? download("meetings.ics", buildICS(upcoming)) : toast("No upcoming events");

  if (isList) {
    $("#calBody").innerHTML = `<div class="card stack">${upcoming.map(eventItem).join("") || `<p class="muted">Nothing scheduled.</p>`}</div>`;
    return bindIcs(app, upcoming);
  }
  const drawMonth = () => {
    const m = state.calMonth, y = m.getFullYear(), mo = m.getMonth();
    const start = new Date(y, mo, 1 - new Date(y, mo, 1).getDay());
    const byDay = {};
    for (const e of events) { const d = new Date(e.starts_at); (byDay[d.toDateString()] ||= []).push(e); }
    let cells = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => `<div class="dow">${d}</div>`).join("");
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      if (i === 35 && d.getMonth() !== mo) break;
      const evs = byDay[d.toDateString()] || [];
      cells += `<div class="day ${d.getMonth() !== mo ? "other" : ""} ${d.toDateString() === now.toDateString() ? "today" : ""}">
        <span class="num">${d.getDate()}</span>${evs.map((e) => `<button class="ev" data-ev="${e.id}" title="${esc(e.title)}">${fmtTime(e.starts_at)} ${esc(e.title)}</button>`).join("")}</div>`;
    }
    $("#calBody").innerHTML = `<div class="row spread" style="margin-bottom:10px"><button class="btn ghost small" id="prev">← Prev</button>
      <h2 style="margin:0">${m.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2><button class="btn ghost small" id="next">Next →</button></div>
      <div class="cal">${cells}</div>`;
    $("#prev").onclick = () => { state.calMonth = new Date(y, mo - 1, 1); drawMonth(); };
    $("#next").onclick = () => { state.calMonth = new Date(y, mo + 1, 1); drawMonth(); };
    $$("[data-ev]").forEach((b) => (b.onclick = () => {
      const e = events.find((x) => x.id === b.dataset.ev);
      const box = openModal(`${eventItem(e)}${e.description ? `<p class="small" style="white-space:pre-wrap">${esc(e.description)}</p>` : ""}<div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn ghost" data-close>Close</button></div>`);
      bindIcs(box, [e]);
    }));
  };
  drawMonth();
}

// ---------- Policies & Dues ---------------------------------------------
async function viewPolicies() {
  app.innerHTML = `<h1>Membership Standards & Policies</h1><div class="card md" style="max-width:820px">${md(state.settings.policies_md)}</div>`;
}
async function viewDues() {
  const s = state.settings;
  const { data, error } = await sb.from("dues").select("*").eq("member_id", state.me.id).order("period", { ascending: false });
  if (error) return fail(error);
  const current = data.find((r) => r.period === s.dues_period);
  app.innerHTML = `<h1>My Dues</h1><div class="grid-2">
    <div class="card"><h2>Current period</h2>${duesStatusHtml(current, s)}</div>
    <div class="card"><h2>History</h2>${data.length ? `<table><tr><th>Period</th><th>Amount</th><th>Status</th></tr>${data.map((r) => `<tr><td>${esc(r.period)}</td><td>${money(r.amount)}</td><td>${r.paid ? `<span class="badge ok">Paid</span>` : `<span class="badge bad">Unpaid</span>`}</td></tr>`).join("")}</table>` : `<p class="muted">No records yet.</p>`}</div></div>
    ${isOfficer() ? `<p style="margin-top:16px"><a href="#/admin/dues">Manage everyone's dues →</a></p>` : ""}`;
}

// ---------- Admin -------------------------------------------------------
async function viewAdmin(tab = "members") {
  const tabs = [["members", "Members"], ["dues", "Dues"], ["events", "Events"], ["settings", "Settings"]];
  app.innerHTML = `<h1>Officer Admin</h1><div class="tabs">${tabs.map(([k, l]) => `<a href="#/admin/${k}" class="${k === tab ? "active" : ""}">${l}</a>`).join("")}</div><div id="adm"></div>`;
  const fn = { members: adminMembers, dues: adminDues, events: adminEvents, settings: adminSettings }[tab] || adminMembers;
  await fn($("#adm"));
}

function memberForm(m = {}) {
  return `<h2>${m.id ? "Edit member" : "Add member"}</h2><form id="mf">
    <div class="fields-2">
      <div class="field"><label>Full name *</label><input name="full_name" value="${esc(m.full_name)}" required></div>
      <div class="field"><label>Email * (used to log in)</label><input name="email" type="email" value="${esc(m.email)}" required></div>
      <div class="field"><label>Phone</label><input name="phone" value="${esc(m.phone)}"></div>
      <div class="field"><label>Business</label><input name="business" value="${esc(m.business)}"></div>
      <div class="field"><label>Industry</label><input name="industry" value="${esc(m.industry)}"></div>
      <div class="field"><label>Website</label><input name="website" value="${esc(m.website)}"></div>
      <div class="field"><label>Role</label><select name="role"><option value="member">Member</option><option value="officer" ${m.role === "officer" ? "selected" : ""}>Officer</option></select></div>
      <div class="field"><label>Joined</label><input name="joined_on" type="date" value="${esc(m.joined_on || today())}"></div>
    </div>
    <div class="field"><label>Bio</label><textarea name="bio">${esc(m.bio)}</textarea></div>
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn">Save</button></div></form>`;
}
async function adminMembers(root) {
  const { data, error } = await sb.from("members").select("*").order("active", { ascending: false }).order("full_name");
  if (error) return fail(error);
  root.innerHTML = `<div class="row spread" style="margin-bottom:12px"><p class="muted small" style="margin:0">${data.filter((m) => m.active).length} active · ${data.filter((m) => !m.active).length} inactive. New members create their own password at "First time? Create your password" using the email you enter here.</p>
    <div class="row"><button class="btn ghost" id="imp">Import CSV</button><button class="btn" id="add">+ Add member</button></div></div>
    <div class="table-wrap"><table><tr><th>Name</th><th>Email</th><th>Business</th><th>Role</th><th>Active</th><th></th></tr>
    ${data.map((m) => `<tr style="${m.active ? "" : "opacity:.55"}"><td>${esc(m.full_name)}</td><td class="small">${esc(m.email)}</td><td class="small">${esc(m.business)}</td>
      <td>${m.role === "officer" ? `<span class="badge">Officer</span>` : "Member"}</td>
      <td><input type="checkbox" data-active="${m.id}" ${m.active ? "checked" : ""} ${m.id === state.me.id ? "disabled" : ""}></td>
      <td class="row" style="flex-wrap:nowrap"><button class="btn ghost small" data-edit="${m.id}">Edit</button>${m.id === state.me.id ? "" : `<button class="btn danger small" data-del="${m.id}">Remove</button>`}</td></tr>`).join("")}
    </table></div>`;
  const edit = (m) => {
    const box = openModal(memberForm(m));
    $("#mf", box).onsubmit = async (e) => {
      e.preventDefault(); const row = formData(e.target);
      const { error } = m?.id ? await sb.from("members").update(row).eq("id", m.id) : await sb.from("members").insert(row);
      if (error) return fail(error.code === "23505" ? { message: "That email is already on the list." } : error);
      closeModal(); toast("Saved"); if (m?.id === state.me.id) await loadMe(true); adminMembers(root);
    };
  };
  $("#add").onclick = () => edit({});
  $$("[data-edit]", root).forEach((b) => (b.onclick = () => edit(data.find((m) => m.id === b.dataset.edit))));
  $$("[data-active]", root).forEach((c) => (c.onchange = async () => {
    const { error } = await sb.from("members").update({ active: c.checked }).eq("id", c.dataset.active);
    if (error) { c.checked = !c.checked; return fail(error); } toast(c.checked ? "Reactivated" : "Deactivated — they can no longer see the site"); adminMembers(root);
  }));
  $$("[data-del]", root).forEach((b) => (b.onclick = async () => {
    const m = data.find((x) => x.id === b.dataset.del);
    if (!confirm(`Permanently remove ${m.full_name} and their dues history?\n\nTip: unchecking "Active" hides them but keeps history.`)) return;
    const { error } = await sb.from("members").delete().eq("id", m.id);
    if (error) return fail(error); toast("Removed"); adminMembers(root);
  }));
  $("#imp").onclick = () => importCsv(root);
}
function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}
function importCsv(root) {
  const box = openModal(`<h2>Import members from CSV</h2>
    <p class="small">In Excel: File → Save As → <b>CSV</b>. The first row should be headers. Recognized columns: <code>name</code> (or full_name), <code>email</code>, <code>phone</code>, <code>business</code> (or company), <code>industry</code>, <code>website</code>, <code>bio</code>. Rows whose email is already listed are skipped.</p>
    <input type="file" id="file" accept=".csv,text/csv"><div id="prev" class="small" style="margin-top:12px"></div>
    <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn ghost" data-close>Cancel</button><button class="btn" id="go" disabled>Import</button></div>`);
  let rows = [];
  const alias = { name: "full_name", "full name": "full_name", full_name: "full_name", email: "email", "e-mail": "email", "email address": "email", phone: "phone", "phone number": "phone", cell: "phone", business: "business", company: "business", "business name": "business", industry: "industry", category: "industry", website: "website", web: "website", bio: "bio" };
  $("#file", box).onchange = async (e) => {
    const [head, ...body] = parseCsv(await e.target.files[0].text());
    const keys = head.map((h) => alias[h.trim().toLowerCase()]);
    rows = body.map((r) => { const o = {}; keys.forEach((k, i) => { if (k && r[i]?.trim()) o[k] = r[i].trim(); }); return o; }).filter((o) => o.email && o.full_name);
    $("#prev", box).innerHTML = rows.length ? `Found <b>${rows.length}</b> members with a name and email. ${keys.includes("full_name") && keys.includes("email") ? "" : "<br><b>Missing a name or email column.</b>"}` : `No usable rows — make sure there's a <code>name</code> and <code>email</code> column.`;
    $("#go", box).disabled = !rows.length;
  };
  $("#go", box).onclick = async () => {
    const { data: existing } = await sb.from("members").select("email");
    const have = new Set((existing || []).map((m) => m.email));
    const seen = new Set();
    const fresh = rows.filter((r) => { const e = r.email.toLowerCase(); if (have.has(e) || seen.has(e)) return false; seen.add(e); return true; });
    if (!fresh.length) { closeModal(); return toast("Everyone in that file is already listed"); }
    const { error } = await sb.from("members").insert(fresh);
    if (error) return fail(error);
    closeModal(); toast(`Imported ${fresh.length} member(s)`); adminMembers(root);
  };
}

async function adminDues(root) {
  const s = state.settings;
  const period = adminDues.period || s.dues_period || String(new Date().getFullYear());
  const [{ data: members }, { data: dues, error }] = await Promise.all([
    sb.from("members").select("id,full_name,email").eq("active", true).order("full_name"),
    sb.from("dues").select("*").eq("period", period),
  ]);
  if (error) return fail(error);
  const byMember = Object.fromEntries((dues || []).map((d) => [d.member_id, d]));
  const paidCount = members.filter((m) => byMember[m.id]?.paid).length;
  root.innerHTML = `<div class="row spread" style="margin-bottom:12px">
    <div class="row"><label style="margin:0">Period</label><input id="per" value="${esc(period)}" style="width:120px"><button class="btn ghost small" id="load">Show</button></div>
    <div class="row"><span class="badge ok">${paidCount} paid</span><span class="badge bad">${members.length - paidCount} unpaid</span><button class="btn ghost small" id="csv">Export CSV</button></div></div>
    <div class="table-wrap"><table><tr><th>Member</th><th>Paid</th><th>Date paid</th><th>Amount</th><th>Note</th></tr>
    ${members.map((m) => { const d = byMember[m.id] || {}; return `<tr data-m="${m.id}"><td>${esc(m.full_name)}</td>
      <td><input type="checkbox" class="paid" ${d.paid ? "checked" : ""}></td>
      <td><input type="date" class="paid_on" value="${esc(d.paid_on)}" style="width:150px"></td>
      <td><input type="number" step="0.01" class="amount" value="${esc(d.amount ?? s.dues_amount ?? "")}" style="width:100px"></td>
      <td><input class="note" value="${esc(d.note)}" placeholder="e.g. Cash App 11/3"></td></tr>`; }).join("")}
    </table></div><p class="small muted">Changes save automatically. Members only ever see their own row.</p>`;
  $("#load").onclick = () => { adminDues.period = $("#per").value.trim(); adminDues(root); };
  $("#csv").onclick = () => download(`dues-${period}.csv`, ["Member,Email,Paid,Date paid,Amount,Note", ...members.map((m) => { const d = byMember[m.id] || {}; return [m.full_name, m.email, d.paid ? "Yes" : "No", d.paid_on || "", d.amount ?? "", d.note || ""].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","); })].join("\n"), "text/csv");
  $$("tr[data-m]", root).forEach((tr) => {
    const save = async (ev) => {
      const paid = $(".paid", tr).checked;
      if (ev?.target.classList.contains("paid")) $(".paid_on", tr).value = paid ? ($(".paid_on", tr).value || today()) : "";
      const row = { member_id: tr.dataset.m, period, paid, paid_on: $(".paid_on", tr).value || null, amount: $(".amount", tr).value || null, note: $(".note", tr).value.trim() || null };
      const { error } = await sb.from("dues").upsert(row, { onConflict: "member_id,period" });
      if (error) return fail(error); toast("Saved");
      if (ev?.target.classList.contains("paid")) adminDues(root);
    };
    $(".paid", tr).onchange = save;
    [".paid_on", ".amount", ".note"].forEach((c) => ($(c, tr).onchange = save));
  });
}

function eventForm(e = {}) {
  return `<h2>${e.id ? "Edit event" : "New event"}</h2><form id="ef">
    <div class="field"><label>Title *</label><input name="title" value="${esc(e.title)}" required placeholder="Weekly meeting"></div>
    <div class="fields-2">
      <div class="field"><label>Starts *</label><input name="starts_at" type="datetime-local" value="${esc(toLocalInput(e.starts_at))}" required></div>
      <div class="field"><label>Ends</label><input name="ends_at" type="datetime-local" value="${esc(toLocalInput(e.ends_at))}"></div>
      <div class="field"><label>Speaker</label><input name="speaker_name" value="${esc(e.speaker_name)}"></div>
      <div class="field"><label>Speaker's business</label><input name="speaker_business" value="${esc(e.speaker_business)}"></div>
    </div>
    <div class="field"><label>Location</label><input name="location" value="${esc(e.location)}"></div>
    <div class="field"><label>Details</label><textarea name="description">${esc(e.description)}</textarea></div>
    ${e.id ? "" : `<div class="field row"><label style="margin:0">Repeat weekly for</label><input name="repeat" type="number" min="1" max="52" value="1" style="width:80px"><span class="small muted">week(s)</span></div>`}
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn">Save</button></div></form>`;
}
async function adminEvents(root) {
  const events = await getEvents();
  const now = Date.now();
  const up = events.filter((e) => new Date(endOf(e)).getTime() >= now), past = events.filter((e) => new Date(endOf(e)).getTime() < now).reverse();
  const rows = (list) => list.map((e) => `<tr><td>${esc(fmtRange(e))}</td><td>${esc(e.title)}</td><td class="small">${esc(e.speaker_name)}</td>
    <td class="row" style="flex-wrap:nowrap"><button class="btn ghost small" data-edit="${e.id}">Edit</button><button class="btn danger small" data-del="${e.id}">Delete</button></td></tr>`).join("");
  root.innerHTML = `<div class="row spread" style="margin-bottom:12px"><h2 style="margin:0">Upcoming</h2><button class="btn" id="add">+ New event</button></div>
    <div class="table-wrap"><table><tr><th>When</th><th>Title</th><th>Speaker</th><th></th></tr>${rows(up) || `<tr><td colspan="4" class="muted">None</td></tr>`}</table></div>
    ${past.length ? `<details style="margin-top:16px"><summary>Past events (${past.length})</summary><div class="table-wrap" style="margin-top:8px"><table>${rows(past)}</table></div></details>` : ""}`;
  const edit = (e) => {
    const box = openModal(eventForm(e));
    $("#ef", box).onsubmit = async (ev) => {
      ev.preventDefault(); const f = formData(ev.target); const repeat = Math.max(1, Math.min(52, Number(f.repeat || 1))); delete f.repeat;
      f.starts_at = fromLocalInput(f.starts_at); f.ends_at = fromLocalInput(f.ends_at);
      if (f.ends_at && f.ends_at <= f.starts_at) return toast("End time must be after start time", true);
      let error;
      if (e.id) ({ error } = await sb.from("events").update(f).eq("id", e.id));
      else {
        const week = 7 * 864e5, shift = (iso, i) => iso && new Date(new Date(iso).getTime() + i * week).toISOString();
        // keep the same local clock time across DST changes
        const fix = (iso, base) => { if (!iso) return iso; const d = new Date(iso), b = new Date(base); d.setHours(b.getHours(), b.getMinutes()); return d.toISOString(); };
        const list = Array.from({ length: repeat }, (_, i) => ({ ...f, starts_at: fix(shift(f.starts_at, i), f.starts_at), ends_at: f.ends_at && fix(shift(f.ends_at, i), f.ends_at) }));
        ({ error } = await sb.from("events").insert(list));
      }
      if (error) return fail(error); closeModal(); toast("Saved"); adminEvents(root);
    };
  };
  $("#add").onclick = () => edit({});
  $$("[data-edit]", root).forEach((b) => (b.onclick = () => edit(events.find((x) => x.id === b.dataset.edit))));
  $$("[data-del]", root).forEach((b) => (b.onclick = async () => {
    if (!confirm("Delete this event?")) return;
    const { error } = await sb.from("events").delete().eq("id", b.dataset.del);
    if (error) return fail(error); toast("Deleted"); adminEvents(root);
  }));
}

async function adminSettings(root) {
  const s = await loadSettings(true);
  root.innerHTML = `<div class="card" style="max-width:820px"><form id="sf">
    <div class="fields-2">
      <div class="field"><label>Group name</label><input name="group_name" value="${esc(s.group_name)}"></div>
      <div class="field"><label>Cash App link (for dues)</label><input name="cashapp_url" value="${esc(s.cashapp_url)}" placeholder="https://cash.app/$YourCashtag"></div>
      <div class="field"><label>Default dues amount</label><input name="dues_amount" type="number" step="0.01" value="${esc(s.dues_amount)}"></div>
      <div class="field"><label>Current dues period</label><input name="dues_period" value="${esc(s.dues_period)}" placeholder="2026"></div>
    </div>
    <div class="field"><label>Dashboard welcome message</label><textarea name="welcome_md">${esc(s.welcome_md)}</textarea></div>
    <div class="field"><label>Membership standards & policies</label><textarea name="policies_md" style="min-height:300px">${esc(s.policies_md)}</textarea>
      <p class="small muted">Formatting: <code>## Heading</code>, <code>**bold**</code>, <code>- bullet</code>, blank line between paragraphs.</p></div>
    <button class="btn">Save settings</button></form></div>`;
  $("#sf").onsubmit = async (e) => {
    e.preventDefault();
    const { error } = await sb.from("site_settings").update(formData(e.target)).eq("id", 1);
    if (error) return fail(error); await loadSettings(true); renderNav("admin"); toast("Settings saved");
  };
}

// ---------- Start -------------------------------------------------------
sb.auth.onAuthStateChange((event, session) => {
  const changed = (state.session?.user?.id) !== (session?.user?.id);
  state.session = session;
  if (!session) { state.me = null; state.settings = null; }
  if (event === "PASSWORD_RECOVERY") { if (location.hash === "#/reset") setTimeout(route, 0); else location.hash = "#/reset"; return; }
  if (changed) setTimeout(route, 0);
});
window.addEventListener("hashchange", route);
sb.auth.getSession().then(({ data }) => { state.session = data.session; route(); });
})();
