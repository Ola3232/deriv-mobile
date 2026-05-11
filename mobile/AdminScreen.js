import React, { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, StatusBar, FlatList,
  ActivityIndicator, Alert, TextInput,
  Share, ScrollView,
} from "react-native";
import * as SecureStore from "expo-secure-store";

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

export default function AdminScreen({ navigation }) {
  const [adminCode, setAdminCode] = useState("");
  const [codes,     setCodes]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [generating,setGenerating]= useState(false);
  const [error,     setError]     = useState(null);

  useEffect(() => {
    SecureStore.getItemAsync("inviteCode").then(c => {
      if (c) setAdminCode(c);
    });
  }, []);

  useEffect(() => {
    if (adminCode) loadCodes();
  }, [adminCode]);

  const revokeCode = async (codeToRevoke) => {
    try {
      const res = await fetch(`${SERVER}/invite/revoke`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ adminCode, codeToRevoke }),
      });
      const data = await res.json();
      if (res.ok) {
        await loadCodes();
        Alert.alert("Révoqué", `Le code ${codeToRevoke} a été révoqué. L'utilisateur sera bloqué au prochain lancement.`);
      } else {
        setError(data.error);
      }
    } catch { setError("Erreur réseau"); }
  };

  const confirmRevoke = (code) => {
    Alert.alert(
      "Révoquer ce code ?",
      `${code}

L'utilisateur sera bloqué au prochain lancement de l'app.`,
      [
        { text: "Annuler", style: "cancel" },
        { text: "Révoquer", style: "destructive", onPress: () => revokeCode(code) },
      ]
    );
  };

  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const loadCodes = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${SERVER}/invite/list`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ adminCode }),
      });
      const data = await res.json();
      if (res.ok) {
        setCodes(data.codes || []);
        setIsSuperAdmin(data.isSuperAdmin || false);
      }
      else setError(data.error);
    } catch { setError("Erreur réseau"); }
    finally   { setLoading(false); }
  };

  const generateCode = async (role) => {
    setGenerating(true);
    try {
      const res  = await fetch(`${SERVER}/invite/generate`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ adminCode, role }),
      });
      const data = await res.json();
      if (res.ok) {
        await loadCodes();
        Alert.alert(
          `Code ${role === 'admin' ? 'Admin' : 'Utilisateur'} créé`,
          `Code : ${data.code}\n\nPartage-le avec la personne de ton choix.`,
          [
            { text: "Copier & Partager", onPress: () => Share.share({ message: `Ton code d'accès Devises Alerts : ${data.code}` }) },
            { text: "OK" },
          ]
        );
      } else {
        setError(data.error);
      }
    } catch { setError("Erreur réseau"); }
    finally   { setGenerating(false); }
  };

  const used   = codes.filter(c => c.used === 1 && c.role !== 'admin');
  const active = codes.filter(c => c.used === 0 && c.role !== 'admin');
  const admins = codes.filter(c => c.role === 'admin');

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <View style={s.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={s.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 20 }}
        >
          <Text style={s.backText}>Retour</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>ADMIN</Text>
        <View style={[s.adminBadge, isSuperAdmin && { backgroundColor: "rgba(124,58,237,0.2)", borderColor: "rgba(124,58,237,0.4)", borderWidth: 1 }]}>
          <Text style={[s.adminBadgeText, isSuperAdmin && { color: "#7C3AED" }]}>
            {isSuperAdmin ? "SUPERADMIN" : "ADMIN"}
          </Text>
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content}>

        {/* Stats */}
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statNum}>{active.length}</Text>
            <Text style={s.statLabel}>CODES ACTIFS</Text>
          </View>
          <View style={s.statCard}>
            <Text style={[s.statNum, { color: C.amber }]}>{used.length}</Text>
            <Text style={s.statLabel}>UTILISÉS</Text>
          </View>
          <View style={s.statCard}>
            <Text style={[s.statNum, { color: C.sub }]}>{admins.length}</Text>
            <Text style={s.statLabel}>ADMINS</Text>
          </View>
        </View>

        {/* Générer des codes */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>GÉNÉRER UN CODE</Text>
          <View style={s.genRow}>
              <TouchableOpacity
                style={[s.genBtn, generating && s.genBtnDisabled]}
                onPress={() => generateCode('user')}
                disabled={generating}
                activeOpacity={0.8}
              >
                {generating ? <ActivityIndicator color={C.bg} size="small" /> : <Text style={s.genBtnText}>+ Code Utilisateur</Text>}
              </TouchableOpacity>
              {isSuperAdmin && (
                <TouchableOpacity
                  style={[s.genBtn, s.genBtnAdmin, generating && s.genBtnDisabled]}
                  onPress={() => generateCode('admin')}
                  disabled={generating}
                  activeOpacity={0.8}
                >
                  {generating ? <ActivityIndicator color={C.bg} size="small" /> : <Text style={s.genBtnText}>+ Code Admin</Text>}
                </TouchableOpacity>
              )}
            </View>
        </View>

        {error && <Text style={s.errorText}>{error}</Text>}

        {/* Liste des codes */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>TOUS LES CODES</Text>
          {loading
            ? <ActivityIndicator color={C.accent} style={{ marginTop: 20 }} />
            : codes.map(c => (
              <View key={c.id} style={[s.codeCard, (c.used === 1 && c.role !== 'admin') && s.codeCardUsed, c.revoked === 1 && s.codeCardRevoked]}>
                <View style={s.codeLeft}>
                  <Text style={[s.codeText, c.revoked === 1 && { textDecorationLine: "line-through", color: C.muted }]}>{c.code}</Text>
                  <Text style={s.codeMeta}>
                    {c.revoked === 1 ? '🚫 Révoqué' :
                     c.role === 'admin' ? '👑 Admin' :
                     c.used === 1 ? `✓ Utilisé par ${c.used_by?.slice(0, 12)}...` : '⏳ En attente'}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={[s.codeBadge, {
                    backgroundColor: c.revoked === 1 ? 'rgba(255,61,113,0.12)' :
                      c.role === 'admin' ? 'rgba(0,200,248,0.15)' :
                      c.used === 1 ? 'rgba(255,179,0,0.12)' : 'rgba(0,230,118,0.12)'
                  }]}>
                    <Text style={[s.codeBadgeText, {
                      color: c.revoked === 1 ? C.red :
                        c.role === 'admin' ? C.accent :
                        c.used === 1 ? C.amber : C.green
                    }]}>
                      {c.revoked === 1 ? 'RÉVOQUÉ' : c.role === 'admin' ? 'ADMIN' : c.used === 1 ? 'UTILISÉ' : 'ACTIF'}
                    </Text>
                  </View>
                  {c.role !== 'admin' && c.revoked !== 1 && (
                    <TouchableOpacity
                      style={s.revokeBtn}
                      onPress={() => confirmRevoke(c.code)}
                      activeOpacity={0.7}
                    >
                      <Text style={s.revokeBtnText}>🚫</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))
          }
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  scroll:  { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },

  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 18, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  backBtn:      { marginRight: 12, paddingVertical: 8, paddingHorizontal: 4 },
  backText:     { color: C.accent, fontSize: 15, fontWeight: "700" },
  headerTitle:  { flex: 1, fontSize: 15, fontWeight: "800", color: C.text, letterSpacing: 3 },
  adminBadge:   { backgroundColor: "rgba(0,200,248,0.15)", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  adminBadgeText: { color: C.accent, fontSize: 10, fontWeight: "700", letterSpacing: 1 },

  statsRow:  { flexDirection: "row", gap: 10, marginBottom: 24 },
  statCard:  { flex: 1, backgroundColor: C.card, borderRadius: 12, padding: 16, alignItems: "center", borderWidth: 1, borderColor: C.border },
  statNum:   { fontSize: 28, fontWeight: "800", color: C.green },
  statLabel: { fontSize: 9, color: C.muted, letterSpacing: 2, marginTop: 4 },

  section:      { marginBottom: 24 },
  sectionTitle: { fontSize: 9, fontWeight: "700", color: C.label, letterSpacing: 3, marginBottom: 12 },

  genRow:         { flexDirection: "row", gap: 10 },
  genBtn: {
    flex: 1, backgroundColor: C.accent, borderRadius: 10,
    padding: 14, alignItems: "center", minHeight: 48, justifyContent: "center",
  },
  genBtnAdmin:    { backgroundColor: "#7C3AED" },
  genBtnDisabled: { opacity: 0.5 },
  genBtnText:     { color: C.bg, fontWeight: "800", fontSize: 12 },

  errorText: { color: C.red, fontSize: 13, textAlign: "center", marginBottom: 16 },

  codeCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.card, borderRadius: 10,
    padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: C.border,
  },
  codeCardUsed: { opacity: 0.6 },
  codeLeft:     { flex: 1 },
  codeText:     { fontSize: 16, fontWeight: "700", color: C.text, letterSpacing: 2 },
  codeMeta:     { fontSize: 11, color: C.sub, marginTop: 3 },
  codeBadge:    { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  codeBadgeText:{ fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  codeCardRevoked: { opacity: 0.5, borderColor: "rgba(255,61,113,0.2)" },
  revokeBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: "rgba(255,61,113,0.1)",
    borderWidth: 1, borderColor: "rgba(255,61,113,0.3)",
    alignItems: "center", justifyContent: "center",
  },
  revokeBtnText: { fontSize: 14 },
});
