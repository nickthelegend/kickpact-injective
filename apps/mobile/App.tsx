import "./polyfill"
import { useState } from "react"
import { ActivityIndicator, Image, Platform, Pressable, View } from "react-native"
import { StatusBar } from "expo-status-bar"
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context"
import { useFonts } from "expo-font"
import { clusterApiUrl } from "@solana/web3.js"

import { C } from "./src/theme"
import { PixelText } from "./src/ui"
import { WalletProvider, useWallet } from "./src/wallet"
import { PrivyHost } from "./src/privy"
import {
  DuelsScreen,
  GameScreen,
  HomeScreen,
  ProfileScreen,
  ReceiptScreen,
  ReceiptsScreen,
  SignInScreen,
} from "./src/screens"
import type { PoolState } from "./src/solana"

/**
 * Kickpact mobile — Expo / React Native on SOLANA. Connect a real wallet with
 * Mobile Wallet Adapter (or a keychain burner) and back World Cup prediction
 * pools settled trustlessly by TxLINE's proofs — plus Bluetooth & online duels
 * where a whole group of friends pot together.
 */

// MWA provider is native-only; on web we render children directly so the
// preview still runs on the burner path.
function WalletHost({ children }: { children: React.ReactNode }) {
  if (Platform.OS === "web") return <>{children}</>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { MobileWalletProvider } = require("@wallet-ui/react-native-web3js")
  return (
    <MobileWalletProvider
      chain="solana:devnet"
      endpoint={clusterApiUrl("devnet")}
      identity={{ name: "Kickpact", uri: "https://kickpact.app", icon: "favicon.png" }}
    >
      {children}
    </MobileWalletProvider>
  )
}

type Tab = "home" | "duels" | "receipts" | "profile"

const TABS: { key: Tab; icon: number; label: string }[] = [
  { key: "home", icon: require("./assets/icons/main_menu.png"), label: "home" },
  { key: "duels", icon: require("./assets/icons/swords.png"), label: "duels" },
  { key: "receipts", icon: require("./assets/icons/book.png"), label: "receipts" },
  { key: "profile", icon: require("./assets/icons/portrait.png"), label: "profile" },
]

function BottomNav({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <View
      style={{
        flexDirection: "row",
        borderTopWidth: 1,
        borderTopColor: "rgba(0,0,0,0.4)",
        backgroundColor: C.frame,
        paddingVertical: 8,
      }}
    >
      {TABS.map((t) => {
        const active = t.key === tab
        return (
          <Pressable key={t.key} onPress={() => onTab(t.key)} style={{ flex: 1, alignItems: "center", gap: 2 }}>
            <View style={{ opacity: active ? 1 : 0.5 }}>
              <Image source={t.icon} style={{ width: 34, height: 34 }} resizeMode="contain" />
            </View>
            <PixelText size={9} color={active ? C.white : C.white45} tracking={1}>
              {t.label}
            </PixelText>
          </Pressable>
        )
      })}
    </View>
  )
}

function Game() {
  const { status } = useWallet()
  const [tab, setTab] = useState<Tab>("home")
  const [gameId, setGameId] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<PoolState | null>(null)

  if (status === "INITIALIZING") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={C.eth} />
      </View>
    )
  }

  if (status === "NO_WALLET" || status === "BACKUP_PENDING") return <SignInScreen />

  if (receipt) return <ReceiptScreen pool={receipt} onBack={() => setReceipt(null)} />
  if (gameId)
    return <GameScreen gameId={gameId} onBack={() => setGameId(null)} onReceipt={(p) => setReceipt(p)} />

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {tab === "home" && <HomeScreen onProfile={() => setTab("profile")} onGame={setGameId} />}
        {tab === "duels" && <DuelsScreen onGame={setGameId} onReceipt={setReceipt} />}
        {tab === "receipts" && <ReceiptsScreen onOpen={setReceipt} />}
        {tab === "profile" && <ProfileScreen />}
      </View>
      <BottomNav tab={tab} onTab={setTab} />
    </View>
  )
}

export default function App() {
  const [fontsLoaded] = useFonts({
    KickpactPixel: require("./assets/fonts/pixel.ttf"),
    KickpactDisplay: require("./assets/fonts/landing.ttf"),
  })

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: C.frameDeep, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={C.eth} />
      </View>
    )
  }

  return (
    <SafeAreaProvider>
      <PrivyHost>
        <WalletHost>
          <WalletProvider>
          <SafeAreaView style={{ flex: 1, backgroundColor: C.frameDeep }} edges={["top", "bottom"]}>
            <StatusBar style="light" />
            <Game />
          </SafeAreaView>
          </WalletProvider>
        </WalletHost>
      </PrivyHost>
    </SafeAreaProvider>
  )
}
