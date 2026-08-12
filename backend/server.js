import express from "express";
import cors from "cors";
import axios from "axios";
import WebSocket from "ws";
import {
  initDB, addAlert, getAlerts, deleteAlert,
  markAlertFired, resetAlertForCooldown, deleteOldFiredAlerts,
  saveToken, getTokens,
  validateCode, markCodeUsed, generateCode, getCodes, revokeCode,
} from "./database.js";
import { ASSETS } from "./assets.js";

const app = express();
app.use(cors());
app.use(express.json());
app.use((req, res, next) => { res.setHeader("Content-Type", "application/json"); next(); });

/* ---- ÉTAT ---- */
const subscribedSymbols = new Set();
let pingInterval = null;
const lastPrices = {};
let ws = null;
// statut ouvert/fermé affiné en live quand possible (best-effort, non bloquant)
const isOpenOverrides = {};
let liveStatusOK = false;
const cooldownMap = new Map();
const COOLDOWN_MS = 2 * 60 * 60 * 1000;

/* ---- PUSH ---- */
async function sendPush(title, body, data = {}, targetUser = null, channelId = "deriv-alerts-trading") {
  const all = await getTokens();
  const tokens = targetUser ? all.filter(t => t.user === targetUser) : all;
  if (!tokens.length) { console.warn(`⚠️ Aucun token user=${targetUser}`); return; }
  for (const t of tokens) {
    try {
      const res = await axios.post("https://exp.host/--/api/v2/push/send",
        { to: t.token, sound: "default", title, body, data, priority: "high", channelId, badge: 1 },
        { headers: { "Content-Type": "application/json", "Accept": "application/json" } }
      );
      const ticket = res.data?.data ?? res.data;
      if (ticket.status === "error") console.error(`❌ Push error:`, ticket.message);
      else console.log(`✅ Push envoyé à user=${targetUser} status=${ticket.status}`);
    } catch (err) {
      console.error(`❌ Push error:`, err.message);
      if (err.response) console.error(`   Response:`, JSON.stringify(err.response.data));
    }
  }
}

/* ---- SYMBOLS ----
   La liste des actifs vient désormais de assets.js (statique, en dur).
   Ce WS est optionnel : il sert juste à rafraîchir le statut ouvert/fermé
   (is_open) quand Deriv répond, mais /symbols ne dépend plus de lui. */
function loadActiveSymbols() {
  const wsS = new WebSocket("wss://ws.derivws.com/websockets/v3?app_id=1089");
  const t = setTimeout(() => { try { wsS.terminate(); } catch {} setTimeout(loadActiveSymbols, 5 * 60 * 1000); }, 15000);
  wsS.on("open", () => wsS.send(JSON.stringify({ active_symbols: "brief", product_type: "basic" })));
  wsS.on("message", (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (!msg.active_symbols) return;
    clearTimeout(t);
    for (const s of msg.active_symbols) {
      if (s.symbol) isOpenOverrides[s.symbol] = s.exchange_is_open === 1;
    }
    liveStatusOK = true;
    console.log(`✅ Statuts ouvert/fermé rafraîchis pour ${msg.active_symbols.length} actifs`);
    try { wsS.close(); } catch {}
    setTimeout(loadActiveSymbols, 5 * 60 * 1000);
  });
  wsS.on("error", (err) => { clearTimeout(t); console.error("❌ WS symbols (statut only, non bloquant):", err.message); setTimeout(loadActiveSymbols, 60000); });
  wsS.on("close", () => clearTimeout(t));
}

/* ---- DERIV WS ---- */

function connectDeriv() {
  ws = new WebSocket("wss://ws.derivws.com/websockets/v3?app_id=1089");
  ws.on("open", () => {
    console.log("✅ Connecté Deriv");
    if (pingInterval) clearInterval(pingInterval);
    pingInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ ping: 1 }));
    }, 30000);
  });
  ws.on("message", async (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (msg.authorize) console.log("✅ Authorize OK, account:", msg.authorize.loginid);
if (msg.error) {
      console.error("❌ Deriv error:", msg.msg_type, JSON.stringify(msg.error));
      const failedSymbol = msg.echo_req && msg.echo_req.ticks;

      return;
    }
        if (!msg.tick) return;
    const { quote: price, symbol } = msg.tick;
    lastPrices[symbol] = price;
    if (!global.__lastTickLog) global.__lastTickLog = {};
    const _now = Date.now();
    if (!global.__lastTickLog[symbol] || _now - global.__lastTickLog[symbol] > 60000) {
      global.__lastTickLog[symbol] = _now;
      console.log(`📈 Tick reçu ${symbol}: ${price}`);
    }
    let alerts; try { alerts = await getAlerts("%"); } catch { return; }
    for (const alert of alerts) {
      if (alert.asset !== symbol) continue;
      const triggered = (alert.condition === "over" && price >= alert.price) || (alert.condition === "under" && price <= alert.price);
      if (!triggered) {
        if (alert.fired === 1) {
          const ls = cooldownMap.get(alert.id) || 0;
          if (Date.now() - ls >= COOLDOWN_MS) { cooldownMap.delete(alert.id); await resetAlertForCooldown(alert.id).catch(() => {}); }
        }
        continue;
      }
      const ls = cooldownMap.get(alert.id) || 0;
      if (Date.now() - ls < COOLDOWN_MS) continue;
      cooldownMap.set(alert.id, Date.now());
      try { await markAlertFired(alert.id); } catch { continue; }
      const dir = alert.condition === "over" ? "au-dessus ↑" : "en-dessous ↓";
      const type = alert.alert_type || "alert";
      const titleMap = { alert: "🔔 Alerte déclenchée !", tp: "✅ Take Profit atteint !", sl: "🛑 Stop Loss atteint !" };
      const prefixMap = { alert: "Niveau atteint", tp: "TP touché", sl: "SL touché" };
      const body = `${prefixMap[type] || "Niveau atteint"} — ${symbol} ${dir} de ${alert.price}\nPrix actuel : ${price.toFixed(4)}`;
      console.log(`🔔 [ALERT #${alert.id} user=${alert.user}] ${body}`);
      const chMap = { trading: "deriv-alerts-trading", alarm: "deriv-alerts-alarm", pulse: "deriv-alerts-pulse" };
      console.log("🚨 Envoi notification", {
        user: alert.user,
        symbol,
        price,
        threshold: alert.price,
        condition: alert.condition,
      });
      await sendPush(titleMap[type] || titleMap.alert, body, { alertId: alert.id, symbol, price, threshold: alert.price, condition: alert.condition }, alert.user, chMap[alert.sound || "trading"] || "deriv-alerts-trading");
    }
  });
  ws.on("close", (code) => {
    ws = null;
    if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
  });
  ws.on("error", (err) => console.error("❌ WS ticks:", err.message));
}
function subscribeSymbol(symbol) {
  if (subscribedSymbols.has(symbol)) return;
  subscribedSymbols.add(symbol);
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
}
/* ---- PRIX PONCTUEL (fallback si pas encore de tick en cache) ---- */
function fetchOncePrice(symbol, timeoutMs = 4000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (val) => { if (done) return; done = true; try { sock.close(); } catch {} resolve(val); };
    const sock = new WebSocket("wss://ws.derivws.com/websockets/v3?app_id=1089");
    const t = setTimeout(() => finish(null), timeoutMs);
    sock.on("open", () => sock.send(JSON.stringify({ ticks_history: symbol, end: "latest", count: 1, style: "ticks" })));
    sock.on("message", (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    console.log("📨 msg_type:", msg.msg_type);      if (msg.error) { clearTimeout(t); finish(null); return; }
      if (msg.history?.prices?.length) { clearTimeout(t); finish(Number(msg.history.prices.at(-1))); }
    });
    sock.on("error", () => { clearTimeout(t); finish(null); });
  });
}
/* ============================================================
   ROUTES
============================================================ */
app.get("/", (req, res) => res.json({ status: "ok", uptime: Math.floor(process.uptime()), symbols_count: ASSETS.length, live_status_ok: liveStatusOK, subscriptions: [...subscribedSymbols] }));

app.get("/symbols", (req, res) => {
  const list = ASSETS.map(s => ({ ...s, is_open: isOpenOverrides[s.symbol] ?? s.is_open }));
  const q = (req.query.q || "").toLowerCase().trim();
  const symbols = q ? list.filter(s => s.symbol.toLowerCase().includes(q) || s.display_name.toLowerCase().includes(q) || s.market_name.toLowerCase().includes(q)) : list;
  const grouped = {};
  for (const s of symbols) { const k = s.market_name || "Autres"; if (!grouped[k]) grouped[k] = []; grouped[k].push(s); }
  res.json({ total: symbols.length, markets: grouped });
});

app.get("/alerts", async (req, res) => {
  try { res.json(await getAlerts(req.query.user || "%")); }
  catch { res.status(500).json({ error: "Erreur base de données" }); }
});

app.post("/alerts", async (req, res) => {
  const { asset, condition, price, user, sound, alertType } = req.body;
  if (!asset || typeof asset !== "string") return res.status(400).json({ error: "Actif invalide" });
  if (!["over", "under"].includes(condition)) return res.status(400).json({ error: "Condition invalide" });
  if (price == null || isNaN(Number(price)) || Number(price) <= 0) return res.status(400).json({ error: "Prix invalide" });
  const numPrice = Number(price);
  subscribeSymbol(asset);
  let cur = lastPrices[asset];
  if (cur == null) { cur = await fetchOncePrice(asset); if (cur != null) lastPrices[asset] = cur; }
  if (cur != null) {
    const already = (condition === "over" && cur >= numPrice) || (condition === "under" && cur <= numPrice);
    if (already) return res.status(409).json({ error: "already_triggered", message: `Prix actuel de ${asset} (${cur}) déjà ${condition === "over" ? "au-dessus" : "en-dessous"} de ${numPrice}.`, currentPrice: cur });
  }
  try { res.status(201).json(await addAlert({ user: user || "default", asset, condition, price: numPrice, sound: sound || "trading", alertType: alertType || "alert" })); }
  catch { res.status(500).json({ error: "Erreur base de données" }); }
});

app.delete("/alerts/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "ID invalide" });
  try { await deleteAlert(id); cooldownMap.delete(id); res.json({ deleted: true, id }); }
  catch { res.status(500).json({ error: "Erreur base de données" }); }
});

app.post("/save-token", async (req, res) => {
  const { token, user } = req.body;
  if (!token || typeof token !== "string") return res.status(400).json({ error: "Token invalide" });
  try { await saveToken(user || "default", token); console.log(`📲 Token sauvegardé user=${user || "default"}`); res.json({ saved: true }); }
  catch { res.status(500).json({ error: "Erreur base de données" }); }
});

app.get("/price/:symbol", (req, res) => {
  const price = lastPrices[req.params.symbol];
  if (price == null) return res.status(404).json({ error: "Prix non disponible" });
  res.json({ symbol: req.params.symbol, price });
});

app.get("/tokens", async (req, res) => {
  try { const t = await getTokens(); res.json({ count: t.length, tokens: t.map(x => ({ id: x.id, user: x.user, token: x.token.slice(0, 20) + "..." })) }); }
  catch { res.status(500).json({ error: "Erreur base de données" }); }
});

// Test push — filtré par userId si fourni
app.get("/test-push", async (req, res) => {
  const userId = req.query.user || null;
  await sendPush("🧪 Test Devises Alert", "Son et vibration OK !", { test: true }, userId);
  res.json({ sent: true, targetUser: userId || "tous" });
});

/* ============================================================
   ROUTES INVITATION
============================================================ */

// Valider un code
app.post("/invite/validate", async (req, res) => {
  const { code, userId } = req.body;
  if (!code) return res.status(400).json({ error: "Code requis" });
  try {
    // Passer userId pour permettre réinstallation sur même appareil
    const result = await validateCode(code, userId, false);
    if (!result.valid) return res.status(403).json({ error: result.reason });
    // Lier le code à cet userId seulement s'il n'est pas déjà utilisé
    if (result.role === "user") await markCodeUsed(code, userId || "unknown");
    res.json({ valid: true, role: result.role });
  } catch (err) {
    console.error("❌ validate:", err.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Vérification au démarrage
app.post("/invite/check", async (req, res) => {
  const { code, userId } = req.body;
  if (!code) return res.status(400).json({ valid: false, reason: "Code requis" });
  try {
    // Passer userId pour permettre réinstallation
    const result = await validateCode(code, userId);
    res.json({ valid: result.valid, role: result.role, reason: result.reason });
  } catch (err) {
    console.error("❌ check:", err.message);
    res.status(500).json({ valid: false, reason: "Erreur serveur" });
  }
});

// Générer un code
app.post("/invite/generate", async (req, res) => {
  const { adminCode, role } = req.body;
  if (!adminCode) return res.status(400).json({ error: "Code admin requis" });
  try {
    const check = await validateCode(adminCode);
    if (!check.valid) return res.status(403).json({ error: "Code invalide" });
    if (!["admin", "superadmin"].includes(check.role)) return res.status(403).json({ error: "Permission insuffisante" });
    const requested = role || "user";
    if (requested === "admin" && check.role !== "superadmin") return res.status(403).json({ error: "Seul le superadmin peut créer des codes admin." });
    const newCode = await generateCode(requested, adminCode.toUpperCase().trim());
    console.log(`🔑 Code ${requested} généré: ${newCode}`);
    res.json({ code: newCode, role: requested });
  } catch (err) {
    console.error("❌ generate:", err.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Lister les codes
app.post("/invite/list", async (req, res) => {
  const { adminCode } = req.body;
  console.log(`📋 invite/list appelé avec code: ${adminCode}`);
  if (!adminCode) return res.status(400).json({ error: "Code admin requis" });
  try {
    const check = await validateCode(adminCode);
    console.log(`📋 validateCode result:`, JSON.stringify(check));
    if (!check.valid) return res.status(403).json({ error: `Code invalide: ${check.reason}` });
    if (!["admin", "superadmin"].includes(check.role)) return res.status(403).json({ error: `Permission insuffisante. Rôle: ${check.role}` });
    const allCodes = await getCodes();
    const codes = check.role === "superadmin" ? allCodes : allCodes.filter(c => c.created_by === adminCode.toUpperCase().trim());
    res.json({ codes, isSuperAdmin: check.role === "superadmin" });
  } catch (err) {
    console.error("❌ list:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Révoquer un code
app.post("/invite/revoke", async (req, res) => {
  const { adminCode, codeToRevoke } = req.body;
  if (!adminCode || !codeToRevoke) return res.status(400).json({ error: "Paramètres manquants" });
  try {
    const check = await validateCode(adminCode);
    if (!check.valid || !["admin", "superadmin"].includes(check.role)) return res.status(403).json({ error: "Permission insuffisante" });
    await revokeCode(codeToRevoke);
    console.log(`🚫 Code révoqué: ${codeToRevoke}`);
    res.json({ revoked: true, code: codeToRevoke });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.use((req, res) => res.status(404).json({ error: `Route inconnue: ${req.method} ${req.path}` }));
app.use((err, req, res, next) => { console.error("❌ Express:", err); res.status(500).json({ error: "Erreur interne" }); });

/* ---- TÂCHES PÉRIODIQUES ---- */
async function runPeriodicTasks() {
  try {
    const alerts = await getAlerts("%");
    for (const a of alerts) {
      if (a.fired !== 1) continue;
      const ls = cooldownMap.get(a.id);
      if (!ls && a.last_sent_at) {
        const elapsed = Date.now() - new Date(a.last_sent_at).getTime();
        if (elapsed >= COOLDOWN_MS) { await resetAlertForCooldown(a.id).catch(() => {}); console.log(`🔄 Alerte #${a.id} réarmée`); }
      }
    }
  } catch (err) { console.error("❌ Cooldown:", err.message); }
  try {
    const deleted = await deleteOldFiredAlerts();
    if (deleted.length > 0) console.log(`🗑️ ${deleted.length} alerte(s) supprimée(s) après 3 jours`);
  } catch (err) { console.error("❌ Suppression auto:", err.message); }
}

/* ---- DÉMARRAGE ---- */
async function start() {
  await initDB();
  const existing = await getAlerts("%");
  for (const a of existing) subscribedSymbols.add(a.asset);
  console.log(`📋 ${existing.length} alerte(s) en DB`);
  connectDeriv();
  loadActiveSymbols();
  setInterval(() => console.log(`💓 Keep-alive — uptime: ${Math.floor(process.uptime())}s`), 5 * 60 * 1000);
  setInterval(runPeriodicTasks, 10 * 60 * 1000);
  runPeriodicTasks();
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`🚀 Port ${PORT}`));
}

start().catch(err => { console.error("❌ Démarrage:", err); process.exit(1); });
