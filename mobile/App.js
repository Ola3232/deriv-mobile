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
        if (code) {
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
        {userRole === "admin" && (
          <Stack.Screen name="Admin" component={AdminScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
