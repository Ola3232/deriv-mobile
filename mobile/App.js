import React, { useEffect, useState, useRef } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as SecureStore from "expo-secure-store";
import * as Notifications from "expo-notifications";
import { View, ActivityIndicator, AppState } from "react-native";

const SERVER = "https://deriv-alerts.onrender.com";

import HomeScreen   from "./Home.js";
import ListAlert    from "./Alert.js";
import InviteScreen from "./InviteScreen.js";
import AdminScreen  from "./AdminScreen.js";

const Stack = createNativeStackNavigator();

export default function App() {
  const [checking, setChecking] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [userRole,  setUserRole]  = useState("user");

  useEffect(() => {
    (async () => {
      try {
        const code = await SecureStore.getItemAsync("inviteCode");
        const role = await SecureStore.getItemAsync("userRole");

        // Pas de code sauvegardé → demander le code
        if (!code) { setChecking(false); return; }

        // Code sauvegardé → accès immédiat sans vérification serveur
        // La vérification serveur se fait en arrière-plan
        setHasAccess(true);
        setUserRole(role || "user");
        setChecking(false);

        // Vérification serveur en arrière-plan (révocation seulement)
        try {
          const uid = await SecureStore.getItemAsync("userId");
          const res = await fetch("https://deriv-alerts.onrender.com/invite/check", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ code, userId: uid }),
          });
          if (res.ok) {
            const data = await res.json();
            if (!data.valid) {
              // Code révoqué → effacer et bloquer
              await SecureStore.deleteItemAsync("inviteCode");
              await SecureStore.deleteItemAsync("userRole");
              setHasAccess(false);
            } else {
              setUserRole(data.role || role || "user");
            }
          }
          // Si erreur réseau → on garde l'accès, pas grave
        } catch {}

      } catch {
        setChecking(false);
      }
    })();
  }, []);

  const handleInviteSuccess = (role) => {
    setUserRole(role);
    setHasAccess(true);
  };

  // Vérifier les alertes manquées quand l'app revient au premier plan
  const appState = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === "active") {
        try {
          const uid = await SecureStore.getItemAsync("userId");
          if (!uid) return;
          const res  = await fetch(`${SERVER}/alerts?user=${uid}`);
          if (!res.ok) return;
          const data = await res.json();
          const missed = (Array.isArray(data) ? data : []).filter(
            a => a.fired === 1 && a.fire_count > 0 && a.last_sent_at
          );
          // Vérifier si des alertes ont été déclenchées dans les dernières 24h
          const recent = missed.filter(a => {
            const firedTime = new Date(a.last_sent_at).getTime();
            return Date.now() - firedTime < 24 * 60 * 60 * 1000;
          });
          if (recent.length > 0) {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: "📊 Alertes déclenchées pendant votre absence",
                body:  `${recent.length} alerte(s) se sont déclenchées. Ouvrez l'app pour voir les détails.`,
                sound: "default",
              },
              trigger: null,
            });
          }
        } catch {}
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, []);

  if (checking) {
    return (
      <View style={{ flex: 1, backgroundColor: "#090D1A", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color="#00C8F8" size="large" />
      </View>
    );
  }

  if (!hasAccess) {
    return <InviteScreen onSuccess={handleInviteSuccess} />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown:  false,
          animation:    "slide_from_right",
          contentStyle: { backgroundColor: "#090D1A" },
        }}
      >
        <Stack.Screen
          name="HomeScreen"
          component={HomeScreen}
          initialParams={{ userRole }}
        />
        <Stack.Screen name="Alert"  component={ListAlert} />
        {(userRole === "admin" || userRole === "superadmin") && (
          <Stack.Screen name="Admin" component={AdminScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
