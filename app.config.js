export default {
  expo: {
    name: "kutana",
    slug: "kutana",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/kutana.png",
    scheme: "kutana",
    userInterfaceStyle: "automatic",
    // newArchEnabled: true,y
    ios: {
      supportsTablet: true,
      infoPlist: {
        NSLocationWhenInUseUsageDescription: "Cette application a besoin de votre localisation pour afficher les utilisateurs à proximité et mettre à jour votre position sur la carte.",
        NSLocationAlwaysUsageDescription: "Cette application a besoin de votre localisation pour afficher les utilisateurs à proximité et mettre à jour votre position sur la carte.",
        ITSAppUsesNonExemptEncryption: false
      },
      bundleIdentifier: "com.biso.kutana"
    },
    android: {
      googleServicesFile: './google-services.json',
      package: "com.kutana",
      versionCode: 1,
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/images/kutana.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png"
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      permissions: [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "RECEIVE_BOOT_COMPLETED",
        "VIBRATE"
      ],
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png"
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/kutana.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
          dark: {
            backgroundColor: "#000000"
          }
        }
      ],
      [
        '@rnmapbox/maps',
        {
            RNMapboxMapsImpl: 'mapbox',
            android: {
              accessToken: process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN || "pk.eyJ1IjoiZ2Joc2FybCIsImEiOiJjbWlvbWdvOTUwM2lqM2VxbzhlMnk3YmRnIn0.nroScN5w8bLu6OXHZgO_kw",
            },
            ios: {
                accessToken: process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN || "pk.eyJ1IjoiZ2Joc2FybCIsImEiOiJjbWlvbWdvOTUwM2lqM2VxbzhlMnk3YmRnIn0.nroScN5w8bLu6OXHZgO_kw",
            }
        },
      ],
      [
        "expo-notifications",
        {
          icon: "./assets/images/kutana.png",
          color: "#ffffff"
        }
      ]
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true
    },
    extra: {
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || "https://etmfpkoghsvkrvbxazlt.supabase.co",
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0bWZwa29naHN2a3J2Ynhhemx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzNzQxMTgsImV4cCI6MjA3ODk1MDExOH0.DSloLRedesuW-upMu8eMxzO3eHA3eONCy2B_QkH7qDY",
      router: {},
      eas: {
        projectId: "df84af22-016e-434a-b1c0-3bd9ea1bc992"
      },
      mapboxAccessToken: process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN || "pk.eyJ1IjoiZ2Joc2FybCIsImEiOiJjbWlvbWdvOTUwM2lqM2VxbzhlMnk3YmRnIn0.nroScN5w8bLu6OXHZgO_kw"
    },
  }
};

