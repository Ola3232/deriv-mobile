import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import HomeScreen from "./Home.js";
import ListAlert from "./Alert.js";

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false, // On gère nos propres headers
          animation: "slide_from_right",
          contentStyle: { backgroundColor: "#090D1A" },
        }}
      >
        <Stack.Screen name="HomeScreen" component={HomeScreen} />
        <Stack.Screen name="Alert" component={ListAlert} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
