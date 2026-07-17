import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import * as SecureStore from "expo-secure-store";

const SERVER = "https://deriv-alerts.onrender.com";

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
};

export default function InviteScreen({ onSuccess }) {
  const [code,        setCode]        = useState("");
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);

  const handleValidate = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return setError("Entre un code d'invitation.");
    setLoading(true);
    setError(null);
    try {
      // Récupérer ou créer userId
      let uid = await SecureStore.getItemAsync("userId");
      if (!uid) {
        uid = "user_" + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
        await SecureStore.setItemAsync("userId", uid);
      }

      const res = await fetch(`${SERVER}/invite/validate`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ code: trimmed, userId: uid }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Code invalide.");
        return;
      }

      // Sauvegarder le code et le rôle
      await SecureStore.setItemAsync("inviteCode", trimmed);
      await SecureStore.setItemAsync("userRole", data.role);
      onSuccess(data.role);
    } catch {
      setError("Impossible de joindre le serveur. Vérifie ta connexion.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={s.container}>

          {/* Logo / Icône */}
          <View style={s.logoWrap}>
            <View style={s.logoCircle}>
              <Text style={s.logoIcon}>📈</Text>
            </View>
            <Text style={s.appName}>DEVISES</Text>
            <Text style={s.appSub}>ALERTS</Text>
          </View>

          {/* Card formulaire */}
          <View style={s.card}>
            <Text style={s.title}>Accès restreint</Text>
            <Text style={s.desc}>
              Cette application est sur invitation uniquement.
              Entre ton code d'accès pour continuer.
            </Text>

            <Text style={s.label}>CODE D'INVITATION</Text>
            <TextInput
              style={[s.input, error && s.inputError]}
              placeholder="Ex : USER-ABC123"
              placeholderTextColor={C.muted}
              value={code}
              onChangeText={t => { setCode(t); setError(null); }}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleValidate}
            />

            {error && (
              <View style={s.errorBox}>
                <Text style={s.errorText}>⚠️  {error}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[s.btn, loading && s.btnDisabled]}
              onPress={handleValidate}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading
                ? <ActivityIndicator color={C.bg} />
                : <Text style={s.btnText}>VALIDER LE CODE</Text>
              }
            </TouchableOpacity>
          </View>

          <Text style={s.footer}>
            Tu n'as pas de code ? Contacte l'administrateur.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: C.bg },
  flex:       { flex: 1 },
  container:  { flex: 1, justifyContent: "center", padding: 24 },

  logoWrap:   { alignItems: "center", marginBottom: 40 },
  logoCircle: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: "rgba(0,200,248,0.1)",
    borderWidth: 2, borderColor: C.accent,
    alignItems: "center", justifyContent: "center",
    marginBottom: 16,
  },
  logoIcon:   { fontSize: 40 },
  appName:    { fontSize: 28, fontWeight: "900", color: C.accent, letterSpacing: 6 },
  appSub:     { fontSize: 14, color: C.sub, letterSpacing: 8, marginTop: 4 },

  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: C.border,
  },
  title:      { fontSize: 20, fontWeight: "800", color: C.text, marginBottom: 10 },
  desc:       { fontSize: 13, color: C.sub, lineHeight: 20, marginBottom: 24 },
  label:      { fontSize: 9, fontWeight: "700", color: C.muted, letterSpacing: 2, marginBottom: 8 },

  input: {
    borderWidth: 1, borderColor: C.border, borderRadius: 12,
    padding: 16, color: C.text, fontSize: 18,
    fontWeight: "700", backgroundColor: C.surface,
    letterSpacing: 3, textAlign: "center",
  },
  inputError: { borderColor: C.red },

  errorBox: {
    backgroundColor: "rgba(255,61,113,0.08)",
    borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: "rgba(255,61,113,0.2)",
    marginTop: 12,
  },
  errorText:  { color: C.red, fontSize: 13, textAlign: "center" },

  btn: {
    backgroundColor: C.accent, borderRadius: 12,
    padding: 16, alignItems: "center",
    marginTop: 20, minHeight: 52, justifyContent: "center",
  },
  btnDisabled: { opacity: 0.5 },
  btnText:     { color: C.bg, fontSize: 14, fontWeight: "800", letterSpacing: 2 },

  footer:     { color: C.muted, fontSize: 12, textAlign: "center", marginTop: 24 },
});
