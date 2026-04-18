import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  RefreshControl,
  FlatList,
  Alert,
} from "react-native";

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
   COMPOSANT CARTE ALERTE
============================================================ */
const AlertCard = ({ item, onDelete }) => {
  const isOver  = item.condition === "over";
  const isFired = item.fired === 1;

  const stripeColor = isFired ? C.amber : isOver ? C.green : C.red;

  const confirmDelete = () =>
    Alert.alert(
      "Supprimer",
      `Supprimer l'alerte ${item.asset} @ ${item.price} ?`,
      [
        { text: "Annuler", style: "cancel" },
        { text: "Supprimer", style: "destructive", onPress: () => onDelete(item.id) },
      ]
    );

  return (
    <View style={[s.card, isFired && s.cardFired]}>
      <View style={[s.stripe, { backgroundColor: stripeColor }]} />

      <View style={s.cardBody}>
        <View style={s.row1}>
          <Text style={s.asset}>{item.asset}</Text>
          <View style={[s.badge, isOver ? s.badgeOver : s.badgeUnder]}>
            <Text style={[s.badgeText, { color: isOver ? C.green : C.red }]}>
              {isOver ? "▲ AU-DESSUS" : "▼ EN-DESSOUS"}
            </Text>
          </View>
        </View>

        <View style={s.row2}>
          <Text style={s.priceLabel}>NIVEAU</Text>
          <Text style={[s.price, isFired && { color: C.amber }]}>
            {Number(item.price).toLocaleString("fr-FR", { minimumFractionDigits: 2 })}
          </Text>
          {isFired && (
            <View style={s.firedPill}>
              <Text style={s.firedText}>✓ DÉCLENCHÉ</Text>
            </View>
          )}
        </View>
      </View>

      <TouchableOpacity style={s.delBtn} onPress={confirmDelete}>
        <Text style={s.delBtnText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
};

/* ============================================================
   SCREEN ALERTES
============================================================ */
export default function ListAlert({ navigation }) {
  const [alerts, setAlerts]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState(null);

  const loadAlerts = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch(`${SERVER}/alerts`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAlerts(data);
      setError(null);
    } catch {
      setError("Impossible de charger les alertes.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAlerts();
    const interval = setInterval(loadAlerts, 10000);
    return () => clearInterval(interval);
  }, [loadAlerts]);

  const handleDelete = async (id) => {
    try {
      const res = await fetch(`${SERVER}/alerts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch {
      Alert.alert("Erreur", "Suppression impossible.");
    }
  };

  const active = alerts.filter((a) => a.fired !== 1);
  const fired  = alerts.filter((a) => a.fired === 1);

  /* ---- Rendu ---- */
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backText}>← Retour</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>MES ALERTES</Text>
        <View style={s.countBadge}>
          <Text style={s.countText}>{alerts.length}</Text>
        </View>
      </View>

      {/* Loading */}
      {loading && (
        <View style={s.center}>
          <ActivityIndicator color={C.accent} size="large" />
          <Text style={s.centerText}>Chargement...</Text>
        </View>
      )}

      {/* Erreur */}
      {error && !loading && (
        <View style={s.center}>
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => loadAlerts()}>
            <Text style={s.retryText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Vide */}
      {!loading && !error && alerts.length === 0 && (
        <View style={s.center}>
          <Text style={{ fontSize: 48 }}>🔔</Text>
          <Text style={s.emptyTitle}>Aucune alerte</Text>
          <Text style={s.emptyText}>
            Retourne à l'accueil pour créer une alerte.
          </Text>
        </View>
      )}

      {/* Liste */}
      {!loading && !error && alerts.length > 0 && (
        <FlatList
          data={[...active, ...fired]}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={s.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadAlerts(true)}
              tintColor={C.accent}
            />
          }
          ListHeaderComponent={
            <View>
              {active.length > 0 && (
                <View style={s.groupHeader}>
                  <Text style={s.groupTitle}>ACTIVES</Text>
                  <View style={s.groupPill}>
                    <Text style={s.groupPillText}>{active.length}</Text>
                  </View>
                </View>
              )}
            </View>
          }
          renderItem={({ item, index }) => {
            // Insérer un séparateur avant les alertes déclenchées
            const isFirstFired = item.fired === 1 && (index === 0 || alerts[index - 1]?.fired !== 1);
            return (
              <>
                {isFirstFired && fired.length > 0 && (
                  <View style={[s.groupHeader, { marginTop: 12 }]}>
                    <Text style={[s.groupTitle, { color: C.amber }]}>DÉCLENCHÉES</Text>
                    <View style={[s.groupPill, { backgroundColor: "rgba(255,179,0,0.12)" }]}>
                      <Text style={[s.groupPillText, { color: C.amber }]}>{fired.length}</Text>
                    </View>
                  </View>
                )}
                <AlertCard item={item} onDelete={handleDelete} />
              </>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

/* ============================================================
   STYLES
============================================================ */
const s = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: C.bg },
  listContent: { padding: 16, paddingBottom: 40 },

  /* Header */
  header: {
    flexDirection:     "row",
    alignItems:        "center",
    paddingHorizontal: 18,
    paddingVertical:   14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  backBtn:       { marginRight: 12 },
  backText:      { color: C.accent, fontSize: 14, fontWeight: "600" },
  headerTitle:   { flex: 1, fontSize: 15, fontWeight: "800", color: C.text, letterSpacing: 3 },
  countBadge: {
    backgroundColor:   C.accent,
    borderRadius:      12,
    minWidth:          28,
    height:            28,
    justifyContent:    "center",
    alignItems:        "center",
    paddingHorizontal: 7,
  },
  countText: { color: C.bg, fontSize: 13, fontWeight: "800" },

  /* États */
  center:     { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  centerText: { color: C.sub, marginTop: 12, fontSize: 13 },
  errorText:  { color: C.red, fontSize: 14, textAlign: "center", marginBottom: 16 },
  retryBtn: {
    borderWidth: 1, borderColor: C.accent, borderRadius: 10,
    paddingHorizontal: 24, paddingVertical: 10,
  },
  retryText:  { color: C.accent, fontWeight: "600" },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: C.text, marginTop: 12 },
  emptyText:  { color: C.muted, fontSize: 13, textAlign: "center", marginTop: 6, lineHeight: 20 },

  /* Groupes */
  groupHeader: {
    flexDirection: "row", alignItems: "center", marginBottom: 10,
  },
  groupTitle: {
    flex: 1, fontSize: 9, fontWeight: "700", color: C.label, letterSpacing: 3,
  },
  groupPill: {
    backgroundColor: "rgba(0,200,248,0.12)",
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3,
  },
  groupPillText: { fontSize: 11, fontWeight: "700", color: C.accent },

  /* Carte */
  card: {
    flexDirection:   "row",
    backgroundColor: C.card,
    borderRadius:    13,
    marginBottom:    10,
    borderWidth:     1,
    borderColor:     C.border,
    overflow:        "hidden",
    alignItems:      "center",
  },
  cardFired: {
    borderColor:     "rgba(255,179,0,0.25)",
    backgroundColor: "rgba(255,179,0,0.03)",
  },
  stripe:   { width: 4, alignSelf: "stretch" },
  cardBody: { flex: 1, padding: 14 },
  row1: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "space-between",
    marginBottom:   8,
  },
  asset: { fontSize: 17, fontWeight: "800", color: C.text, letterSpacing: 0.5 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, borderWidth: 1 },
  badgeOver:  { borderColor: "rgba(0,230,118,0.3)", backgroundColor: "rgba(0,230,118,0.07)" },
  badgeUnder: { borderColor: "rgba(255,61,113,0.3)", backgroundColor: "rgba(255,61,113,0.07)" },
  badgeText:  { fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  row2:       { flexDirection: "row", alignItems: "center", gap: 8 },
  priceLabel: { fontSize: 9, color: C.muted, fontWeight: "700", letterSpacing: 2 },
  price:      { fontSize: 19, fontWeight: "700", color: C.accent },
  firedPill: {
    backgroundColor: "rgba(255,179,0,0.1)",
    borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
  },
  firedText:  { fontSize: 9, fontWeight: "700", color: C.amber, letterSpacing: 1 },
  delBtn: {
    width: 44, alignSelf: "stretch",
    alignItems: "center", justifyContent: "center",
    borderLeftWidth: 1, borderLeftColor: C.border,
  },
  delBtnText: { color: C.red, fontSize: 15, fontWeight: "700" },
});
