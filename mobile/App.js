import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as SecureStore from "expo-secure-store";
import { View, ActivityIndicator } from "react-native";

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

        if (!code) { setChecking(false); return; }

        // Vérification serveur — le code est-il toujours valide ?
        try {
          const uid = await SecureStore.getItemAsync("userId");
          const res = await fetch("https://deriv-backend-1.onrender.com/invite/check", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ code, userId: uid }),
          });

          if (res.ok) {
            const data = await res.json();
            if (data.valid) {
              setHasAccess(true);
              setUserRole(data.role || role || "user");
            } else {
              // Code révoqué par l'admin → effacer et redemander
              await SecureStore.deleteItemAsync("inviteCode");
              await SecureStore.deleteItemAsync("userRole");
              setHasAccess(false);
            }
          } else {
            // Serveur indisponible → accès offline temporaire
            setHasAccess(true);
            setUserRole(role || "user");
          }
        } catch {
          // Pas de réseau → accès offline temporaire
          setHasAccess(true);
          setUserRole(role || "user");
        }
      } catch {}
      setChecking(false);
    })();
  }, []);

  const handleInviteSuccess = (role) => {
    setUserRole(role);
    setHasAccess(true);
  };

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
