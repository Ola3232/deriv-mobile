import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Pressable,
  Modal,
  Alert,
  TextInput,
  ActivityIndicator,
  StatusBar,
  SafeAreaView,
  RefreshControl,
  ScrollView,
  SectionList,
} from "react-native";

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";

/* ============================================================
   CONFIG
============================================================ */
const SERVER = "https://deriv-backend-8b4w.onrender.com";

const C = {
  bg:      "#090D1A",
  surface: "#0F1623",
  card:    "#141C2E",
  border:  "#1C2840",
  accent:  "#00C8F8",
  green:   "#00E676",
  red:     "#FF3D71",
  amber:   "#FFB300",
  text:    "#E2E8F8",
  sub:     "#8892B0",
  muted:   "#4A5270",
  label:   "#6B7494",
};

/* ============================================================
   NOTIFICATIONS
============================================================ */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function registerForPushNotifications() {
  if (!Device.isDevice) return null;
  const { status: existing } = await Notifications.getPermissionsAsync();
  let final = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    final = status;
  }
  if (final !== "granted") return null;
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({
      projectId: "5025bb1c-7e81-44c6-9bdc-c054a317651c",
    });
    return data;
  } catch {
    return null;
  }
}

/* ============================================================
   safeFetch — vérifie Content-Type avant de parser JSON
============================================================ */
async function safeFetch(url, options = {}) {
  const res         = await fetch(url, options);
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      `Serveur indisponible (HTTP ${res.status}). Vérifie que le backend Render est bien démarré.`
    );
  }
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

/* ============================================================
   COMPOSANT : CARTE ALERTE
   Correction suppression :
   - On utilise TouchableOpacity au lieu de Pressable (plus fiable dans ScrollView)
   - La suppression est directe : pas de Alert.alert qui peut bloquer sur certains OS
     → on utilise un modal de confirmation maison pour éviter les conflits natifs
============================================================ */
const AlertCard = ({ item, onDelete }) => {
  const isOver  = item.condition === "over";
  const isFired = item.fired === 1;

  // Suppression directe sans confirmation native
  // (Alert.alert peut être bloqué par le ScrollView sur Android)
  const doDelete = () => onDelete(item.id);

  return (
    <View style={[s.alertCard, isFired && s.alertCardFired]}>
      {/* Barre couleur gauche */}
      <View style={[s.stripe, {
        backgroundColor: isFired ? C.amber : isOver ? C.green : C.red,
      }]} />

      {/* Contenu */}
      <View style={s.alertBody}>
        <View style={s.alertRow1}>
          <Text style={s.alertAsset}>{item.asset}</Text>
          <View style={[s.badge, isOver ? s.badgeOver : s.badgeUnder]}>
            <Text style={[s.badgeText, { color: isOver ? C.green : C.red }]}>
              {isOver ? "▲ AU-DESSUS" : "▼ EN-DESSOUS"}
            </Text>
          </View>
        </View>
        <View style={s.alertRow2}>
          <Text style={s.alertPriceLabel}>NIVEAU  </Text>
          <Text style={[s.alertPrice, isFired && { color: C.amber }]}>
            {Number(item.price).toLocaleString("fr-FR", { minimumFractionDigits: 2 })}
          </Text>
          {isFired && (
            <View style={s.firedPill}>
              <Text style={s.firedText}>✓ DÉCLENCHÉ</Text>
            </View>
          )}
        </View>
      </View>

      {/* Bouton supprimer — TouchableOpacity simple, zone large */}
      <TouchableOpacity
        style={s.deleteBtn}
        activeOpacity={0.6}
        onPress={doDelete}
      >
        <Text style={s.deleteBtnText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
};

/* ============================================================
   COMPOSANT : MODAL CONFIRMATION SUPPRESSION
   (remplace Alert.alert natif qui cause des problèmes sur Android dans ScrollView)
============================================================ */
const DeleteConfirmModal = ({ visible, assetName, price, onConfirm, onCancel }) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
    <View style={s.overlayCenter}>
      <View style={s.confirmModal}>
        <Text style={s.confirmIcon}>🗑️</Text>
        <Text style={s.confirmTitle}>Supprimer l'alerte ?</Text>
        <Text style={s.confirmBody}>
          {assetName} @ {price}
        </Text>
        <View style={s.confirmBtns}>
          <TouchableOpacity style={s.confirmCancel} activeOpacity={0.7} onPress={onCancel}>
            <Text style={s.confirmCancelText}>Annuler</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.confirmDelete} activeOpacity={0.7} onPress={onConfirm}>
            <Text style={s.confirmDeleteText}>Supprimer</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

/* ============================================================
   COMPOSANT : MODAL SÉLECTION D'ACTIF
============================================================ */
const AssetPickerModal = ({ visible, onClose, onSelect, selected }) => {
  const [search,  setSearch]  = useState("");
  const [markets, setMarkets] = useState({});
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const fetchSymbols = useCallback(async () => {
    setLoading(true);
    setError(null);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const { ok, status, data } = await safeFetch(`${SERVER}/symbols`);
        if (status === 503 && data.error === "loading") {
          if (attempt < 4) { await new Promise((r) => setTimeout(r, 3000)); continue; }
          throw new Error("Le serveur charge les actifs, réessaie dans quelques secondes.");
        }
        if (!ok) throw new Error(data.error || `Erreur HTTP ${status}`);
        if (!data.markets || Object.keys(data.markets).length === 0)
          throw new Error("Aucun actif reçu du serveur.");
        setMarkets(data.markets);
        setLoading(false);
        return;
      } catch (err) {
        if (attempt === 4) {
          setError(err.message || "Impossible de charger les actifs.");
          setLoading(false);
        }
      }
    }
  }, []);

  useEffect(() => {
    if (!visible) { setSearch(""); return; }
    fetchSymbols();
  }, [visible]);

  const sections = useMemo(() => {
    const q = search.toLowerCase().trim();
    return Object.entries(markets)
      .map(([marketName, symbols]) => ({
        title: marketName,
        data: q
          ? symbols.filter(
              (sym) =>
                sym.symbol.toLowerCase().includes(q) ||
                sym.display_name.toLowerCase().includes(q)
            )
          : symbols,
      }))
      .filter((sec) => sec.data.length > 0);
  }, [markets, search]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.pickerWrap}>
        <Pressable style={s.pickerBg} onPress={onClose} />
        <View style={s.pickerSheet}>
          <View style={s.pickerHeader}>
            <Text style={s.pickerTitle}>CHOISIR UN ACTIF</Text>
            <TouchableOpacity hitSlop={16} onPress={onClose}>
              <Text style={s.pickerClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={s.searchWrap}>
            <Text style={s.searchIcon}>🔍</Text>
            <TextInput
              style={s.searchInput}
              placeholder="Bitcoin, EUR/USD, Boom 1000…"
              placeholderTextColor={C.muted}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Text style={{ color: C.muted, fontSize: 16, paddingHorizontal: 4 }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {loading && (
            <View style={s.pickerState}>
              <ActivityIndicator color={C.accent} size="large" />
              <Text style={s.pickerStateText}>
                Chargement des actifs Deriv…{"\n"}
                <Text style={{ color: C.muted, fontSize: 11 }}>
                  (peut prendre quelques secondes au démarrage)
                </Text>
              </Text>
            </View>
          )}

          {error && !loading && (
            <View style={s.pickerState}>
              <Text style={{ fontSize: 36, marginBottom: 12 }}>⚠️</Text>
              <Text style={[s.pickerStateText, { color: C.red, marginBottom: 16 }]}>{error}</Text>
              <TouchableOpacity style={s.retryBtn} activeOpacity={0.7} onPress={fetchSymbols}>
                <Text style={s.retryText}>↺  Réessayer</Text>
              </TouchableOpacity>
            </View>
          )}

          {!loading && !error && sections.length === 0 && search.length > 0 && (
            <View style={s.pickerState}>
              <Text style={{ fontSize: 32, marginBottom: 10 }}>🔍</Text>
              <Text style={s.pickerStateText}>Aucun actif pour « {search} »</Text>
            </View>
          )}

          {!loading && !error && sections.length > 0 && (
            <SectionList
              sections={sections}
              keyExtractor={(item) => item.symbol}
              stickySectionHeadersEnabled
              keyboardShouldPersistTaps="always"
              contentContainerStyle={{ paddingBottom: 40 }}
              renderSectionHeader={({ section }) => (
                <View style={s.sectionHeaderRow}>
                  <Text style={s.sectionHeaderText}>{section.title.toUpperCase()}</Text>
                </View>
              )}
              renderItem={({ item }) => {
                const isSelected = selected === item.symbol;
                return (
                  <TouchableOpacity
                    style={[s.assetRow, isSelected && s.assetRowSelected]}
                    activeOpacity={0.7}
                    onPress={() => { onSelect(item); onClose(); }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[s.assetRowSymbol, isSelected && { color: C.accent }]}>
                        {item.symbol}
                      </Text>
                      <Text style={s.assetRowName} numberOfLines={1}>
                        {item.display_name}
                      </Text>
                    </View>
                    <View style={s.assetRowRight}>
                      <View style={[s.marketDot, { backgroundColor: item.is_open ? C.green : C.muted }]} />
                      {isSelected && (
                        <Text style={{ color: C.accent, fontWeight: "700", marginLeft: 8, fontSize: 16 }}>✓</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

/* ============================================================
   SCREEN PRINCIPAL
============================================================ */
export default function HomeScreen() {
  // Form
  const [asset,        setAsset]        = useState(null);
  const [price,        setPrice]        = useState("");
  const [condition,    setCondition]    = useState("over");
  const [pickerOpen,   setPickerOpen]   = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [successModal, setSuccessModal] = useState(false);
  const [successData,  setSuccessData]  = useState(null);

  // Confirmation suppression
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, asset, price }

  // Liste alertes
  const [alerts,      setAlerts]      = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [listError,   setListError]   = useState(null);

  /* ---------- Charger alertes ---------- */
  const loadAlerts = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const { ok, data } = await safeFetch(`${SERVER}/alerts`);
      if (!ok) throw new Error(data.error || "Erreur serveur");
      setAlerts(data);
      setListError(null);
    } catch (e) {
      setListError(e.message || "Impossible de charger les alertes.");
    } finally {
      setLoadingList(false);
      setRefreshing(false);
    }
  }, []);

  /* ---------- Init ---------- */
  useEffect(() => {
    registerForPushNotifications().then((token) => {
      if (!token) return;
      safeFetch(`${SERVER}/save-token`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token }),
      }).catch(() => {});
    });
    loadAlerts();
    const interval = setInterval(loadAlerts, 10000);
    return () => clearInterval(interval);
  }, []);

  /* ---------- Reset form ---------- */
  const resetForm = () => { setAsset(null); setPrice(""); setCondition("over"); };

  /* ---------- Créer alerte ---------- */
  const handleSubmit = async () => {
    if (!asset) { Alert.alert("Champ manquant", "Sélectionne un actif."); return; }
    const numPrice = Number(price);
    if (!price || isNaN(numPrice) || numPrice <= 0) {
      Alert.alert("Prix invalide", "Entre un prix supérieur à 0.");
      return;
    }
    setSubmitting(true);
    try {
      const { ok, status, data } = await safeFetch(`${SERVER}/alerts`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ asset: asset.symbol, condition, price: numPrice }),
      });
      if (status === 409) { Alert.alert("⚠️ Impossible", data.message, [{ text: "OK" }]); return; }
      if (!ok) throw new Error(data.error || "Erreur serveur");
      setSuccessData({ asset: asset.symbol, display: asset.display_name, condition, price: numPrice });
      setSuccessModal(true);
      resetForm();
      loadAlerts();
    } catch (e) {
      Alert.alert("Erreur", e.message || "Impossible de contacter le serveur.");
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------- Demander confirmation suppression ---------- */
  const requestDelete = (id) => {
    const item = alerts.find((a) => a.id === id);
    if (!item) return;
    setDeleteTarget({ id: item.id, asset: item.asset, price: item.price });
  };

  /* ---------- Confirmer suppression ---------- */
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    setDeleteTarget(null);                             // fermer le modal d'abord
    setAlerts((prev) => prev.filter((a) => a.id !== id)); // update UI immédiat

    try {
      const res = await fetch(`${SERVER}/alerts/${id}`, { method: "DELETE" });
      // On accepte tout status 2xx
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      console.warn("Suppression échouée:", e.message);
      loadAlerts(); // resync depuis le serveur
    }
  };

  const active = alerts.filter((a) => a.fired !== 1);
  const fired  = alerts.filter((a) => a.fired === 1);

  /* ============================================================
     RENDU
  ============================================================ */
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="always"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadAlerts(true)} tintColor={C.accent} />
        }
      >
        {/* HEADER */}
        <View style={s.header}>
          <View>
            <Text style={s.headerTitle}>DERIV ALERT</Text>
            <Text style={s.headerSub}>Surveillance de prix temps réel</Text>
          </View>
          <View style={s.headerBadge}>
            <Text style={s.headerBadgeNum}>{active.length}</Text>
            <Text style={s.headerBadgeLabel}>actives</Text>
          </View>
        </View>

        {/* FORMULAIRE */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>CRÉER UNE ALERTE</Text>
          <View style={s.formCard}>
            <Text style={s.fieldLabel}>ACTIF</Text>
            <TouchableOpacity
              style={[s.dropdown, asset && s.dropdownActive]}
              activeOpacity={0.7}
              onPress={() => setPickerOpen(true)}
            >
              <View style={{ flex: 1 }}>
                {asset ? (
                  <>
                    <Text style={s.dropdownSymbol}>{asset.symbol}</Text>
                    <Text style={s.dropdownSubname} numberOfLines={1}>{asset.display_name}</Text>
                  </>
                ) : (
                  <Text style={s.dropdownPlaceholder}>Appuyer pour choisir un actif…</Text>
                )}
              </View>
              <Text style={s.dropdownArrow}>▾</Text>
            </TouchableOpacity>

            <Text style={[s.fieldLabel, { marginTop: 16 }]}>NIVEAU DE PRIX</Text>
            <TextInput
              style={s.input}
              placeholder="Ex : 1250.50"
              placeholderTextColor={C.muted}
              keyboardType="numeric"
              value={price}
              onChangeText={setPrice}
              returnKeyType="done"
            />

            <Text style={[s.fieldLabel, { marginTop: 16 }]}>CONDITION</Text>
            <View style={s.condRow}>
              <TouchableOpacity
                style={[s.condBtn, condition === "over" && s.condBtnOver]}
                activeOpacity={0.7}
                onPress={() => setCondition("over")}
              >
                <Text style={[s.condBtnText, condition === "over" && { color: C.green }]}>▲  AU-DESSUS</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.condBtn, condition === "under" && s.condBtnUnder]}
                activeOpacity={0.7}
                onPress={() => setCondition("under")}
              >
                <Text style={[s.condBtnText, condition === "under" && { color: C.red }]}>▼  EN-DESSOUS</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[s.submitBtn, submitting && s.submitBtnDisabled]}
              activeOpacity={0.8}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting
                ? <ActivityIndicator color={C.bg} />
                : <Text style={s.submitBtnText}>+ CRÉER L'ALERTE</Text>
              }
            </TouchableOpacity>
          </View>
        </View>

        {/* ALERTES ACTIVES */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>ALERTES ACTIVES</Text>
            <View style={s.pill}><Text style={s.pillText}>{active.length}</Text></View>
          </View>

          {loadingList && (
            <View style={s.stateBox}>
              <ActivityIndicator color={C.accent} />
              <Text style={s.stateText}>Chargement…</Text>
            </View>
          )}
          {listError && !loadingList && (
            <View style={s.stateBox}>
              <Text style={s.stateError}>{listError}</Text>
              <TouchableOpacity style={s.retryBtn} activeOpacity={0.7} onPress={loadAlerts}>
                <Text style={s.retryText}>↺  Réessayer</Text>
              </TouchableOpacity>
            </View>
          )}
          {!loadingList && !listError && active.length === 0 && (
            <View style={s.emptyBox}>
              <Text style={s.emptyIcon}>🔔</Text>
              <Text style={s.emptyText}>Aucune alerte active</Text>
            </View>
          )}
          {active.map((item) => (
            <AlertCard key={item.id} item={item} onDelete={requestDelete} />
          ))}
        </View>

        {/* ALERTES DÉCLENCHÉES */}
        {fired.length > 0 && (
          <View style={[s.section, { marginBottom: 40 }]}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>DÉCLENCHÉES</Text>
              <View style={[s.pill, { backgroundColor: "rgba(255,179,0,0.15)" }]}>
                <Text style={[s.pillText, { color: C.amber }]}>{fired.length}</Text>
              </View>
            </View>
            {fired.map((item) => (
              <AlertCard key={item.id} item={item} onDelete={requestDelete} />
            ))}
          </View>
        )}
      </ScrollView>

      {/* PICKER ACTIF */}
      <AssetPickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(sym) => setAsset(sym)}
        selected={asset?.symbol}
      />

      {/* MODAL CONFIRMATION SUPPRESSION */}
      <DeleteConfirmModal
        visible={!!deleteTarget}
        assetName={deleteTarget?.asset}
        price={deleteTarget?.price}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* MODAL SUCCÈS */}
      <Modal visible={successModal} transparent animationType="fade" onRequestClose={() => setSuccessModal(false)}>
        <View style={s.overlayCenter}>
          <View style={s.successModal}>
            <Text style={s.successIcon}>✅</Text>
            <Text style={s.successTitle}>Alerte créée !</Text>
            {successData && (
              <View style={s.successTable}>
                <View style={s.successRow}>
                  <Text style={s.successKey}>Actif</Text>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={s.successVal}>{successData.asset}</Text>
                    <Text style={[s.successKey, { marginTop: 2 }]}>{successData.display}</Text>
                  </View>
                </View>
                <View style={s.divider} />
                <View style={s.successRow}>
                  <Text style={s.successKey}>Niveau</Text>
                  <Text style={s.successVal}>
                    {Number(successData.price).toLocaleString("fr-FR", { minimumFractionDigits: 2 })}
                  </Text>
                </View>
                <View style={s.divider} />
                <View style={s.successRow}>
                  <Text style={s.successKey}>Condition</Text>
                  <Text style={[s.successVal, { color: successData.condition === "over" ? C.green : C.red }]}>
                    {successData.condition === "over" ? "▲ Au-dessus" : "▼ En-dessous"}
                  </Text>
                </View>
              </View>
            )}
            <TouchableOpacity style={s.successBtn} activeOpacity={0.8} onPress={() => setSuccessModal(false)}>
              <Text style={s.successBtnText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ============================================================
   STYLES
============================================================ */
const s = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: C.bg },
  scroll:        { flex: 1 },
  scrollContent: { paddingBottom: 40 },

  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 18,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerTitle:      { fontSize: 24, fontWeight: "900", color: C.accent, letterSpacing: 5 },
  headerSub:        { fontSize: 11, color: C.sub, marginTop: 3, letterSpacing: 1 },
  headerBadge: {
    alignItems: "center", backgroundColor: "rgba(0,200,248,0.1)",
    borderWidth: 1, borderColor: "rgba(0,200,248,0.25)",
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8,
  },
  headerBadgeNum:   { fontSize: 22, fontWeight: "800", color: C.accent },
  headerBadgeLabel: { fontSize: 10, color: C.sub, letterSpacing: 1 },

  section:       { paddingHorizontal: 16, marginTop: 24 },
  sectionHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  sectionTitle:  { fontSize: 10, fontWeight: "700", color: C.label, letterSpacing: 3, flex: 1 },
  pill: { backgroundColor: "rgba(0,200,248,0.12)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { fontSize: 12, fontWeight: "700", color: C.accent },

  formCard: { backgroundColor: C.card, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: C.border },
  fieldLabel: { fontSize: 9, fontWeight: "700", color: C.label, letterSpacing: 2, marginBottom: 8 },

  dropdown: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderColor: C.border, borderRadius: 10,
    padding: 14, backgroundColor: C.surface, minHeight: 62,
  },
  dropdownActive:      { borderColor: C.accent },
  dropdownSymbol:      { fontSize: 15, fontWeight: "700", color: C.text },
  dropdownSubname:     { fontSize: 11, color: C.sub, marginTop: 2 },
  dropdownPlaceholder: { color: C.muted, fontWeight: "400", fontSize: 14 },
  dropdownArrow:       { color: C.muted, fontSize: 12, marginLeft: 8 },

  input: {
    borderWidth: 1, borderColor: C.border, borderRadius: 10,
    padding: 14, color: C.text, fontSize: 16, fontWeight: "600",
    backgroundColor: C.surface, minHeight: 52,
  },

  condRow: { flexDirection: "row", gap: 10 },
  condBtn: {
    flex: 1, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: C.border,
    alignItems: "center", backgroundColor: C.surface, minHeight: 52, justifyContent: "center",
  },
  condBtnOver:  { borderColor: "rgba(0,230,118,0.5)", backgroundColor: "rgba(0,230,118,0.07)" },
  condBtnUnder: { borderColor: "rgba(255,61,113,0.5)", backgroundColor: "rgba(255,61,113,0.07)" },
  condBtnText:  { fontSize: 11, fontWeight: "700", color: C.muted, letterSpacing: 1 },

  submitBtn: {
    marginTop: 20, backgroundColor: C.accent, borderRadius: 12, padding: 16,
    alignItems: "center", minHeight: 52, justifyContent: "center",
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText:     { color: C.bg, fontSize: 13, fontWeight: "800", letterSpacing: 2 },

  /* Alertes */
  alertCard: {
    flexDirection: "row", backgroundColor: C.card, borderRadius: 13,
    marginBottom: 10, borderWidth: 1, borderColor: C.border,
    alignItems: "stretch", minHeight: 76,
  },
  alertCardFired: { borderColor: "rgba(255,179,0,0.3)", backgroundColor: "rgba(255,179,0,0.04)" },
  stripe:    { width: 4, borderTopLeftRadius: 13, borderBottomLeftRadius: 13 },
  alertBody: { flex: 1, padding: 14, justifyContent: "center" },
  alertRow1: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  alertAsset:      { fontSize: 17, fontWeight: "800", color: C.text, letterSpacing: 0.5 },
  alertRow2:       { flexDirection: "row", alignItems: "center", gap: 8 },
  alertPriceLabel: { fontSize: 9, color: C.muted, fontWeight: "700", letterSpacing: 2 },
  alertPrice:      { fontSize: 19, fontWeight: "700", color: C.accent },
  firedPill: { backgroundColor: "rgba(255,179,0,0.12)", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  firedText: { fontSize: 9, fontWeight: "700", color: C.amber, letterSpacing: 1 },

  deleteBtn: {
    width: 56, alignItems: "center", justifyContent: "center",
    borderLeftWidth: 1, borderLeftColor: C.border,
    borderTopRightRadius: 13, borderBottomRightRadius: 13,
    // Fond légèrement rouge pour indiquer la zone de suppression
    backgroundColor: "rgba(255,61,113,0.05)",
  },
  deleteBtnText: { color: C.red, fontSize: 20, fontWeight: "700" },

  badge:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, borderWidth: 1 },
  badgeOver:  { borderColor: "rgba(0,230,118,0.3)", backgroundColor: "rgba(0,230,118,0.07)" },
  badgeUnder: { borderColor: "rgba(255,61,113,0.3)", backgroundColor: "rgba(255,61,113,0.07)" },
  badgeText:  { fontSize: 9, fontWeight: "700", letterSpacing: 1 },

  stateBox:   { alignItems: "center", padding: 24 },
  stateText:  { color: C.sub, marginTop: 10, fontSize: 13 },
  stateError: { color: C.red, fontSize: 13, textAlign: "center", marginBottom: 12 },
  retryBtn:   { borderWidth: 1, borderColor: C.accent, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10, minHeight: 44, justifyContent: "center" },
  retryText:  { color: C.accent, fontWeight: "600", fontSize: 13 },
  emptyBox:   { alignItems: "center", paddingVertical: 28 },
  emptyIcon:  { fontSize: 36, marginBottom: 8 },
  emptyText:  { color: C.muted, fontSize: 13 },

  /* Picker */
  pickerWrap:  { flex: 1, justifyContent: "flex-end" },
  pickerBg:    { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.7)" },
  pickerSheet: {
    backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: "85%", borderTopWidth: 1, borderTopColor: C.border,
  },
  pickerHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 18, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  pickerTitle: { fontSize: 12, fontWeight: "700", color: C.label, letterSpacing: 3 },
  pickerClose: { color: C.muted, fontSize: 18, fontWeight: "700" },
  searchWrap: {
    flexDirection: "row", alignItems: "center", margin: 12,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border,
  },
  searchIcon:  { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, color: C.text, fontSize: 14, fontWeight: "500" },
  pickerState:     { alignItems: "center", paddingVertical: 48, paddingHorizontal: 24 },
  pickerStateText: { color: C.sub, fontSize: 13, marginTop: 12, textAlign: "center", lineHeight: 20 },
  sectionHeaderRow: {
    backgroundColor: C.bg, paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  sectionHeaderText: { fontSize: 9, fontWeight: "700", color: C.label, letterSpacing: 2 },
  assetRow: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.border, minHeight: 58,
  },
  assetRowSelected:  { backgroundColor: "rgba(0,200,248,0.06)" },
  assetRowSymbol:    { fontSize: 14, fontWeight: "700", color: C.text },
  assetRowName:      { fontSize: 11, color: C.sub, marginTop: 2 },
  assetRowRight:     { flexDirection: "row", alignItems: "center" },
  marketDot:         { width: 8, height: 8, borderRadius: 4 },

  /* Overlay central */
  overlayCenter: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "rgba(0,0,0,0.75)" },

  /* Modal confirmation suppression */
  confirmModal: {
    backgroundColor: C.card, borderRadius: 20, padding: 28,
    borderWidth: 1, borderColor: "rgba(255,61,113,0.3)", alignItems: "center",
  },
  confirmIcon:   { fontSize: 36, marginBottom: 12 },
  confirmTitle:  { fontSize: 18, fontWeight: "800", color: C.text, marginBottom: 8 },
  confirmBody:   { fontSize: 14, color: C.sub, marginBottom: 24, textAlign: "center" },
  confirmBtns:   { flexDirection: "row", gap: 12, width: "100%" },
  confirmCancel: {
    flex: 1, paddingVertical: 14, borderRadius: 11, borderWidth: 1, borderColor: C.border,
    alignItems: "center", justifyContent: "center",
  },
  confirmCancelText: { color: C.sub, fontWeight: "600", fontSize: 14 },
  confirmDelete: {
    flex: 1, paddingVertical: 14, borderRadius: 11,
    backgroundColor: C.red, alignItems: "center", justifyContent: "center",
  },
  confirmDeleteText: { color: "#fff", fontWeight: "800", fontSize: 14 },

  /* Modal succès */
  successModal: {
    backgroundColor: C.card, borderRadius: 20, padding: 28,
    borderWidth: 1, borderColor: C.border, alignItems: "center",
  },
  successIcon:  { fontSize: 42, marginBottom: 10 },
  successTitle: { fontSize: 20, fontWeight: "800", color: C.text, marginBottom: 20, letterSpacing: 1 },
  successTable: {
    width: "100%", backgroundColor: C.surface, borderRadius: 12,
    padding: 16, marginBottom: 20, borderWidth: 1, borderColor: C.border,
  },
  successRow:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 9 },
  divider:     { height: 1, backgroundColor: C.border },
  successKey:  { fontSize: 11, color: C.sub, fontWeight: "600", letterSpacing: 1 },
  successVal:  { fontSize: 15, color: C.text, fontWeight: "700" },
  successBtn: {
    backgroundColor: C.accent, paddingVertical: 14, borderRadius: 11,
    width: "100%", alignItems: "center", minHeight: 52, justifyContent: "center",
  },
  successBtnText: { color: C.bg, fontWeight: "800", fontSize: 14, letterSpacing: 2 },
});
