/* ============================================================
   LISTE STATIQUE DES ACTIFS DERIV
   ------------------------------------------------------------
   Remplace le chargement live via WebSocket (active_symbols),
   qui dépendait de la disponibilité du serveur Deriv et
   provoquait des recherches vides côté app.

   Pour ajouter un actif : copie une ligne existante du même
   groupe et change symbol / display_name.
   symbol = le code exact envoyé à l'API Deriv (ticks, etc.)
============================================================ */

const synthetic = (symbol, display_name, submarket, submarket_name) => ({
  symbol, display_name,
  market: "synthetic_index", market_name: "Synthetic Indices",
  submarket, submarket_name,
  is_open: true, // les indices synthétiques sont ouverts 24/7
});

const forex = (symbol, display_name, submarket, submarket_name) => ({
  symbol, display_name,
  market: "forex", market_name: "Forex",
  submarket, submarket_name,
  is_open: true, // pas de statut live ; le forex ferme le week-end
});

const commodity = (symbol, display_name) => ({
  symbol, display_name,
  market: "commodities", market_name: "Matières premières",
  submarket: "metals", submarket_name: "Métaux",
  is_open: true,
});

export const ASSETS = [
  // --- Volatility Indices ---
  synthetic("R_10", "Volatility 10 Index", "random_index", "Continuous Indices"),
  synthetic("R_25", "Volatility 25 Index", "random_index", "Continuous Indices"),
  synthetic("R_50", "Volatility 50 Index", "random_index", "Continuous Indices"),
  synthetic("R_75", "Volatility 75 Index", "random_index", "Continuous Indices"),
  synthetic("R_100", "Volatility 100 Index", "random_index", "Continuous Indices"),

  // --- Volatility Indices (1s) ---
  synthetic("1HZ10V", "Volatility 10 (1s) Index", "random_index", "Continuous Indices (1s)"),
  synthetic("1HZ25V", "Volatility 25 (1s) Index", "random_index", "Continuous Indices (1s)"),
  synthetic("1HZ50V", "Volatility 50 (1s) Index", "random_index", "Continuous Indices (1s)"),
  synthetic("1HZ75V", "Volatility 75 (1s) Index", "random_index", "Continuous Indices (1s)"),
  synthetic("1HZ100V", "Volatility 100 (1s) Index", "random_index", "Continuous Indices (1s)"),
  synthetic("1HZ150V", "Volatility 150 (1s) Index", "random_index", "Continuous Indices (1s)"),
  synthetic("1HZ250V", "Volatility 250 (1s) Index", "random_index", "Continuous Indices (1s)"),

  // --- Crash / Boom ---
  synthetic("BOOM300N", "Boom 300 Index", "crash_index", "Crash/Boom Indices"),
  synthetic("BOOM500", "Boom 500 Index", "crash_index", "Crash/Boom Indices"),
  synthetic("BOOM1000", "Boom 1000 Index", "crash_index", "Crash/Boom Indices"),
  synthetic("CRASH300N", "Crash 300 Index", "crash_index", "Crash/Boom Indices"),
  synthetic("CRASH500", "Crash 500 Index", "crash_index", "Crash/Boom Indices"),
  synthetic("CRASH1000", "Crash 1000 Index", "crash_index", "Crash/Boom Indices"),

  // --- Step Indices ---
  synthetic("stpRNG", "Step Index", "step_index", "Step Indices"),
  synthetic("stpRNG2", "Step Index 200", "step_index", "Step Indices"),
  synthetic("stpRNG3", "Step Index 300", "step_index", "Step Indices"),
  synthetic("stpRNG4", "Step Index 400", "step_index", "Step Indices"),
  synthetic("stpRNG5", "Step Index 500", "step_index", "Step Indices"),

  // --- Jump Indices ---
  synthetic("JD10", "Jump 10 Index", "jump_index", "Jump Indices"),
  synthetic("JD25", "Jump 25 Index", "jump_index", "Jump Indices"),
  synthetic("JD50", "Jump 50 Index", "jump_index", "Jump Indices"),
  synthetic("JD75", "Jump 75 Index", "jump_index", "Jump Indices"),
  synthetic("JD100", "Jump 100 Index", "jump_index", "Jump Indices"),

  // --- Range Break ---
  synthetic("RB100", "Range Break 100 Index", "range_break", "Range Break Indices"),
  synthetic("RB200", "Range Break 200 Index", "range_break", "Range Break Indices"),

  // --- Bear / Bull ---
  synthetic("RDBEAR", "Bear Market Index", "random_daily", "Daily Reset Indices"),
  synthetic("RDBULL", "Bull Market Index", "random_daily", "Daily Reset Indices"),

  // --- Forex : paires majeures ---
  forex("frxEURUSD", "EUR/USD", "major_pairs", "Paires majeures"),
  forex("frxGBPUSD", "GBP/USD", "major_pairs", "Paires majeures"),
  forex("frxUSDJPY", "USD/JPY", "major_pairs", "Paires majeures"),
  forex("frxAUDUSD", "AUD/USD", "major_pairs", "Paires majeures"),
  forex("frxUSDCAD", "USD/CAD", "major_pairs", "Paires majeures"),
  forex("frxUSDCHF", "USD/CHF", "major_pairs", "Paires majeures"),
  forex("frxNZDUSD", "NZD/USD", "major_pairs", "Paires majeures"),

  // --- Forex : paires croisées ---
  forex("frxEURGBP", "EUR/GBP", "minor_pairs", "Paires croisées"),
  forex("frxEURJPY", "EUR/JPY", "minor_pairs", "Paires croisées"),
  forex("frxEURAUD", "EUR/AUD", "minor_pairs", "Paires croisées"),
  forex("frxEURCAD", "EUR/CAD", "minor_pairs", "Paires croisées"),
  forex("frxEURCHF", "EUR/CHF", "minor_pairs", "Paires croisées"),
  forex("frxEURNZD", "EUR/NZD", "minor_pairs", "Paires croisées"),
  forex("frxGBPJPY", "GBP/JPY", "minor_pairs", "Paires croisées"),
  forex("frxGBPAUD", "GBP/AUD", "minor_pairs", "Paires croisées"),
  forex("frxGBPCAD", "GBP/CAD", "minor_pairs", "Paires croisées"),
  forex("frxGBPCHF", "GBP/CHF", "minor_pairs", "Paires croisées"),
  forex("frxGBPNZD", "GBP/NZD", "minor_pairs", "Paires croisées"),
  forex("frxAUDJPY", "AUD/JPY", "minor_pairs", "Paires croisées"),
  forex("frxAUDCAD", "AUD/CAD", "minor_pairs", "Paires croisées"),
  forex("frxAUDCHF", "AUD/CHF", "minor_pairs", "Paires croisées"),
  forex("frxAUDNZD", "AUD/NZD", "minor_pairs", "Paires croisées"),
  forex("frxCADJPY", "CAD/JPY", "minor_pairs", "Paires croisées"),
  forex("frxCADCHF", "CAD/CHF", "minor_pairs", "Paires croisées"),
  forex("frxCHFJPY", "CHF/JPY", "minor_pairs", "Paires croisées"),
  forex("frxNZDJPY", "NZD/JPY", "minor_pairs", "Paires croisées"),

  // --- Matières premières ---
  commodity("frxXAUUSD", "Gold/USD"),
  commodity("frxXAGUSD", "Silver/USD"),
];
