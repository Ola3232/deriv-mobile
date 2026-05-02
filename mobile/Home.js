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
  Platform,
} from "react-native";

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";

/* ============================================================
   CONFIG
============================================================ */
const SERVER = "https://deriv-backend-1.onrender.com";

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
   NOTIFICATIONS — canal Android haute priorité + son
============================================================ */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:  true,
    shouldPlaySound:  true,
    shouldSetBadge:   true,
    priority:         Notifications.AndroidNotificationPriority.MAX,
  }),
});

// Crée le canal Android une seule fois au démarrage
async function setupNotificationChannel() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("deriv-alerts", {
      name:                 "Deriv Price Alerts",
      importance:           Notifications.AndroidImportance.MAX,
      sound:                "default",
      vibrationPattern:     [0, 250, 150, 250, 150, 500],
      enableVibrate:        true,
      enableLights:         true,
      lightColor:           "#00C8F8",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd:            true,          // passe en mode Ne pas déranger
      showBadge:            true,
    });
  }
}

async function registerForPushNotifications() {
  if (!Device.isDevice) return null;

  // Créer le canal AVANT de demander le token
  await setupNotificationChannel();

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
   safeFetch
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
   USER ID — identifiant unique persistant par appareil
============================================================ */
async function getUserId() {
  try {
    let uid = await SecureStore.getItemAsync("userId");
    if (!uid) {
      uid = "user_" + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
      await SecureStore.setItemAsync("userId", uid);
    }
    return uid;
  } catch {
    return "user_default";
  }
}

/* ============================================================
   COMPOSANT : CARTE ALERTE
============================================================ */
const AlertCard = ({ item, onDelete }) => {
  const isOver  = item.condition === "over";
  const isFired = item.fired === 1;

  const doDelete = () => onDelete(item.id);

  return (
    <View style={[s.alertCard, isFired && s.alertCardFired]}>
      <View style={[s.stripe, {
        backgroundColor: isFired ? C.amber : isOver ? C.green : C.red,
      }]} />
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
   MODAL CONFIRMATION SUPPRESSION
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
   MODAL SÉLECTION D'ACTIF
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
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }
        if (!ok) throw new Error(data.error || "Erreur serveur");
        setMarkets(data.markets || {});
        setLoading(false);
        return;
      } catch (err) {
        if (attempt === 4) {
          setError(err.message);
          setLoading(false);
        } else {
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }
  }, []);

  useEffect(() => {
    if (visible) fetchSymbols();
  }, [visible, fetchSymbols]);

  const sections = useMemo(() => {
    const q = search.toLowerCase().trim();
    return Object.entries(markets)
      .map(([market, items]) => ({
        title: market,
        data: q
          ? items.filter(i =>
              i.symbol.toLowerCase().includes(q) ||
              i.display_name.toLowerCase().includes(q)
            )
          : items,
      }))
      .filter(s => s.data.length > 0);
  }, [markets, search]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.pickerWrap}>
        <Pressable style={s.pickerBg} onPress={onClose} />
        <View style={s.pickerSheet}>
          <View style={s.pickerHeader}>
            <Text style={s.pickerTitle}>CHOISIR UN ACTIF</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={s.pickerClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={s.searchWrap}>
            <Text style={s.searchIcon}>🔍</Text>
            <TextInput
              style={s.searchInput}
              placeholder="Rechercher..."
              placeholderTextColor={C.muted}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
            />
          </View>
          {loading && (
            <View style={s.pickerState}>
              <ActivityIndicator color={C.accent} size="large" />
              <Text style={s.pickerStateText}>Chargement des actifs...</Text>
            </View>
          )}
          {error && !loading && (
            <View style={s.pickerState}>
              <Text style={{ color: C.red, textAlign: "center", marginBottom: 16 }}>{error}</Text>
              <TouchableOpacity style={s.retryBtn} onPress={fetchSymbols}>
                <Text style={s.retryText}>Réessayer</Text>
              </TouchableOpacity>
            </View>
          )}
          {!loading && !error && (
            <SectionList
              sections={sections}
              keyExtractor={item => item.symbol}
              renderSectionHeader={({ section }) => (
                <View style={s.sectionHeaderRow}>
                  <Text style={s.sectionHeaderText}>{section.title.toUpperCase()}</Text>
                </View>
              )}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[s.assetRow, item.symbol === selected && s.assetRowSelected]}
                  onPress={() => { onSelect(item); onClose(); }}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.assetRowSymbol}>{item.symbol}</Text>
                    <Text style={s.assetRowName}>{item.display_name}</Text>
                  </View>
                  <View style={s.assetRowRight}>
                    <View style={[s.marketDot, { backgroundColor: item.is_open ? C.green : C.muted }]} />
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

/* ============================================================
   ÉCRAN PRINCIPAL
============================================================ */
export default function HomeScreen({ navigation }) {
  const [userId,       setUserId]       = useState(null);
  const [alerts,       setAlerts]       = useState([]);
  const [loadingAlerts,setLoadingAlerts] = useState(true);
  const [alertsError,  setAlertsError]  = useState(null);
  const [refreshing,   setRefreshing]   = useState(false);

  // Formulaire
  const [asset,      setAsset]      = useState(null);
  const [condition,  setCondition]  = useState("over");
  const [price,      setPrice]      = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError,  setFormError]  = useState(null);

  // Modals
  const [pickerOpen,    setPickerOpen]    = useState(false);
  const [successModal,  setSuccessModal]  = useState(null);
  const [deleteModal,   setDeleteModal]   = useState(null); // { id, asset, price }

  /* ---- Init userId ---- */
  useEffect(() => {
    getUserId().then(uid => setUserId(uid));
  }, []);

  /* ---- Enregistrement push ---- */
  const [tokenStatus, setTokenStatus] = useState("...");

  useEffect(() => {
    (async () => {
      if (!Device.isDevice) {
        setTokenStatus("❌ Pas un vrai appareil (émulateur)");
        return;
      }
      const { status: existing } = await Notifications.getPermissionsAsync();
      let final = existing;
      if (existing !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        final = status;
      }
      if (final !== "granted") {
        setTokenStatus("❌ Permission refusée");
        return;
      }
      try {
        await setupNotificationChannel();
        const { data: token } = await Notifications.getExpoPushTokenAsync({
          projectId: "5025bb1c-7e81-44c6-9bdc-c054a317651c",
        });
        setTokenStatus("📲 Token obtenu, connexion serveur...");

        // Sauvegarde token — raw fetch, affiche erreur exacte
        let saved = false;
        for (let attempt = 1; attempt <= 10; attempt++) {
          try {
            setTokenStatus(`⏳ Tentative ${attempt}/10...`);
            const uid = await getUserId();
            const res = await fetch(`${SERVER}/save-token`, {
              method:  "POST",
              headers: { "Content-Type": "application/json" },
              body:    JSON.stringify({ token, user: uid }),
            });
            const text = await res.text();
            setTokenStatus(`HTTP ${res.status} | ${text.slice(0, 60)}`);
            let data = {};
            try { data = JSON.parse(text); } catch {}

            if (res.ok && data.saved) {
              setTokenStatus("✅ Token enregistré !");
              saved = true;
              break;
            }
          } catch (err) {
            setTokenStatus(`❌ Fetch err: ${err.message}`);
          }
          await new Promise(r => setTimeout(r, 5000));
        }

        if (!saved && !saved) setTokenStatus("❌ Échec après 10 tentatives");
      } catch (e) {
        setTokenStatus("❌ Erreur : " + e.message);
      }
    })();
  }, []);

  /* ---- Chargement alertes ---- */
  const loadAlerts = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const uid = await getUserId();
      const { ok, data } = await safeFetch(`${SERVER}/alerts?user=${uid}`);
      if (!ok) throw new Error();
      setAlerts(data);
      setAlertsError(null);
    } catch {
      setAlertsError("Impossible de charger les alertes.");
    } finally {
      setLoadingAlerts(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAlerts();
    const interval = setInterval(loadAlerts, 10000);
    return () => clearInterval(interval);
  }, [loadAlerts]);

  // Recharger les alertes quand on revient de la page Alert
  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      loadAlerts();
    });
    return unsubscribe;
  }, [navigation, loadAlerts]);

  /* ---- Suppression ---- */
  const handleDeletePress = (id, asset, price) => {
    setDeleteModal({ id, asset, price });
  };

  const confirmDelete = async () => {
    if (!deleteModal) return;
    const { id } = deleteModal;
    setDeleteModal(null);
    try {
      const { ok } = await safeFetch(`${SERVER}/alerts/${id}`, { method: "DELETE" });
      if (!ok) throw new Error();
      setAlerts(prev => prev.filter(a => a.id !== id));
    } catch {
      Alert.alert("Erreur", "Suppression impossible.");
    }
  };

  /* ---- Soumission alerte ---- */
  const handleSubmit = async () => {
    setFormError(null);
    const numPrice = parseFloat(price.replace(",", "."));
    if (!asset)          return setFormError("Choisis un actif.");
    if (isNaN(numPrice) || numPrice <= 0) return setFormError("Entre un prix valide.");

    setSubmitting(true);
    try {
      const { ok, status, data } = await safeFetch(`${SERVER}/alerts`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ asset: asset.symbol, condition, price: numPrice, user: userId }),
      });

      if (status === 409) {
        setFormError(data.message || "Cette alerte est déjà déclenchée.");
        return;
      }
      if (!ok) {
        setFormError(data.error || "Erreur serveur.");
        return;
      }

      setAlerts(prev => [data, ...prev]);
      setSuccessModal(data);
      setPrice("");
      setAsset(null);
      setCondition("over");
      setFormError(null);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const active = alerts.filter(a => a.fired !== 1);
  const fired  = alerts.filter(a => a.fired === 1);

  /* ============================================================
     RENDU
  ============================================================ */
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadAlerts(true)}
            tintColor={C.accent}
          />
        }
      >
        {/* HEADER */}
        <View style={s.header}>
          <View>
            <Text style={s.headerTitle}>DEVISES</Text>
            <Text style={s.headerSub}>ALERTS</Text>
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 5 }}>
              <View style={{
                width: 9, height: 9, borderRadius: 5, marginRight: 6,
                backgroundColor:
                  tokenStatus.startsWith("✅") ? C.green :
                  tokenStatus.startsWith("⏳") ? C.amber :
                  tokenStatus.startsWith("📲") ? C.amber :
                  C.red,
              }} />
              {(tokenStatus.startsWith("❌") || tokenStatus.startsWith("⏳")) && (
                <Text style={{ fontSize: 9, color: C.muted }}>
                  ({tokenStatus.slice(tokenStatus.indexOf(" ") + 1)})
                </Text>
              )}
            </View>
          </View>
          <TouchableOpacity
            style={s.headerBadge}
            onPress={() => navigation.navigate("Alert")}
            activeOpacity={0.7}
          >
            <Text style={s.headerBadgeNum}>{alerts.length}</Text>
            <Text style={s.headerBadgeLabel}>ALERTES</Text>
          </TouchableOpacity>
        </View>

        {/* FORMULAIRE */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>NOUVELLE ALERTE</Text>
          </View>
          <View style={s.formCard}>
            {/* Actif */}
            <Text style={s.fieldLabel}>ACTIF</Text>
            <TouchableOpacity
              style={[s.dropdown, asset && s.dropdownActive]}
              onPress={() => setPickerOpen(true)}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                {asset ? (
                  <>
                    <Text style={s.dropdownSymbol}>{asset.symbol}</Text>
                    <Text style={s.dropdownSubname}>{asset.display_name}</Text>
                  </>
                ) : (
                  <Text style={s.dropdownPlaceholder}>Sélectionner un actif...</Text>
                )}
              </View>
              <Text style={s.dropdownArrow}>▼</Text>
            </TouchableOpacity>

            {/* Prix */}
            <Text style={[s.fieldLabel, { marginTop: 16 }]}>NIVEAU DE PRIX</Text>
            <TextInput
              style={s.input}
              placeholder="Ex : 1850.50"
              placeholderTextColor={C.muted}
              keyboardType="decimal-pad"
              value={price}
              onChangeText={setPrice}
              returnKeyType="done"
            />

            {/* Condition */}
            <Text style={[s.fieldLabel, { marginTop: 16 }]}>CONDITION</Text>
            <View style={s.condRow}>
              <TouchableOpacity
                style={[s.condBtn, condition === "over"  && s.condBtnOver]}
                onPress={() => setCondition("over")}
                activeOpacity={0.7}
              >
                <Text style={[s.condBtnText, condition === "over"  && { color: C.green }]}>
                  ▲ AU-DESSUS
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.condBtn, condition === "under" && s.condBtnUnder]}
                onPress={() => setCondition("under")}
                activeOpacity={0.7}
              >
                <Text style={[s.condBtnText, condition === "under" && { color: C.red }]}>
                  ▼ EN-DESSOUS
                </Text>
              </TouchableOpacity>
            </View>

            {formError && (
              <Text style={{ color: C.red, fontSize: 12, marginTop: 10 }}>{formError}</Text>
            )}

            <TouchableOpacity
              style={[s.submitBtn, submitting && s.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.8}
            >
              {submitting
                ? <ActivityIndicator color={C.bg} />
                : <Text style={s.submitBtnText}>＋ CRÉER L'ALERTE</Text>
              }
            </TouchableOpacity>
          </View>
        </View>

        {/* LISTE ALERTES */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>MES ALERTES</Text>
            <TouchableOpacity
              style={[s.pill, { flexDirection: "row", alignItems: "center", gap: 6 }]}
              onPress={() => navigation.navigate("Alert")}
              activeOpacity={0.7}
            >
              {alerts.length > 0 && (
                <View style={{
                  backgroundColor: C.accent, borderRadius: 8,
                  minWidth: 18, height: 18, alignItems: "center", justifyContent: "center",
                  paddingHorizontal: 4,
                }}>
                  <Text style={{ color: C.bg, fontSize: 10, fontWeight: "800" }}>{alerts.length}</Text>
                </View>
              )}
              <Text style={s.pillText}>Tout voir →</Text>
            </TouchableOpacity>
          </View>

          {loadingAlerts && (
            <View style={s.stateBox}>
              <ActivityIndicator color={C.accent} />
              <Text style={s.stateText}>Chargement...</Text>
            </View>
          )}

          {alertsError && !loadingAlerts && (
            <View style={s.stateBox}>
              <Text style={s.stateError}>{alertsError}</Text>
              <TouchableOpacity style={s.retryBtn} onPress={() => loadAlerts()}>
                <Text style={s.retryText}>Réessayer</Text>
              </TouchableOpacity>
            </View>
          )}

          {!loadingAlerts && !alertsError && alerts.length === 0 && (
            <View style={s.emptyBox}>
              <Text style={s.emptyIcon}>🔔</Text>
              <Text style={s.emptyText}>Aucune alerte créée</Text>
            </View>
          )}

          {!loadingAlerts && !alertsError && active.length > 0 && (
            <>
              <View style={[s.sectionHeader, { marginBottom: 8 }]}>
                <Text style={[s.sectionTitle, { fontSize: 8 }]}>ACTIVES</Text>
                <View style={s.pill}><Text style={s.pillText}>{active.length}</Text></View>
              </View>
              {active.slice(0, 5).map(item => (
                <AlertCard
                  key={item.id}
                  item={item}
                  onDelete={(id) => handleDeletePress(id, item.asset, item.price)}
                />
              ))}
            </>
          )}

          {!loadingAlerts && !alertsError && fired.length > 0 && (
            <>
              <View style={[s.sectionHeader, { marginTop: 12, marginBottom: 8 }]}>
                <Text style={[s.sectionTitle, { fontSize: 8, color: C.amber }]}>DÉCLENCHÉES</Text>
                <View style={[s.pill, { backgroundColor: "rgba(255,179,0,0.12)" }]}>
                  <Text style={[s.pillText, { color: C.amber }]}>{fired.length}</Text>
                </View>
              </View>
              {fired.slice(0, 3).map(item => (
                <AlertCard
                  key={item.id}
                  item={item}
                  onDelete={(id) => handleDeletePress(id, item.asset, item.price)}
                />
              ))}
            </>
          )}
        </View>
      </ScrollView>

      {/* MODAL SÉLECTION ACTIF */}
      <AssetPickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={setAsset}
        selected={asset?.symbol}
      />

      {/* MODAL SUPPRESSION */}
      <DeleteConfirmModal
        visible={!!deleteModal}
        assetName={deleteModal?.asset}
        price={deleteModal?.price}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteModal(null)}
      />

      {/* MODAL SUCCÈS */}
      {successModal && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setSuccessModal(null)}>
          <View style={s.overlayCenter}>
            <View style={s.successModal}>
              <Text style={s.successIcon}>✅</Text>
              <Text style={s.successTitle}>ALERTE CRÉÉE</Text>
              <View style={s.successTable}>
                <View style={s.successRow}>
                  <Text style={s.successKey}>ACTIF</Text>
                  <Text style={s.successVal}>{successModal.asset}</Text>
                </View>
                <View style={s.divider} />
                <View style={s.successRow}>
                  <Text style={s.successKey}>CONDITION</Text>
                  <Text style={[s.successVal, { color: successModal.condition === "over" ? C.green : C.red }]}>
                    {successModal.condition === "over" ? "▲ AU-DESSUS" : "▼ EN-DESSOUS"}
                  </Text>
                </View>
                <View style={s.divider} />
                <View style={s.successRow}>
                  <Text style={s.successKey}>NIVEAU</Text>
                  <Text style={s.successVal}>
                    {Number(successModal.price).toLocaleString("fr-FR", { minimumFractionDigits: 2 })}
                  </Text>
                </View>
              </View>
              <TouchableOpacity style={s.successBtn} onPress={() => setSuccessModal(null)}>
                <Text style={s.successBtnText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
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

  overlayCenter: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "rgba(0,0,0,0.75)" },

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
