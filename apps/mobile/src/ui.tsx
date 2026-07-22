/**
 * Kickpact styled components (React Native StyleSheet) — the premium pixel-
 * cabinet look rebuilt natively, matching the web app. No NativeWind; pure RN
 * so it renders identically on Android and the web preview.
 */
import type { ReactNode } from "react"
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native"

import { C, FONT } from "./theme"

// ── Pixel text ──
export function PixelText({
  children,
  style,
  size = 14,
  color = C.white,
  tracking = 1,
  upper = true,
}: {
  children: ReactNode
  style?: StyleProp<TextStyle>
  size?: number
  color?: string
  tracking?: number
  upper?: boolean
}) {
  return (
    <Text
      style={[
        {
          fontFamily: FONT.pixel,
          fontSize: size,
          color,
          letterSpacing: tracking,
          textTransform: upper ? "uppercase" : "none",
        },
        style,
      ]}
    >
      {children}
    </Text>
  )
}

// ── Pixel cabinet button (bevelled) ──
export function PixelButton({
  label,
  onPress,
  color = C.green,
  textColor = C.white,
  style,
  size = 15,
}: {
  label: string
  onPress?: () => void
  color?: string
  textColor?: string
  style?: StyleProp<ViewStyle>
  size?: number
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: color, transform: [{ translateY: pressed ? 2 : 0 }] },
        style,
      ]}
    >
      <PixelText size={size} color={textColor} tracking={2}>
        {label}
      </PixelText>
    </Pressable>
  )
}

// ── Bevelled panel (in-game tile) ──
export function Panel({
  children,
  style,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  return <View style={[styles.panel, style]}>{children}</View>
}

// ── Balance chip ──
export function BalanceChip({
  icon,
  amount,
  onPressAdd,
}: {
  icon: ImageSourcePropType
  amount: string
  onPressAdd?: () => void
}) {
  return (
    <View style={styles.chip}>
      <Image source={icon} style={styles.chipIcon} resizeMode="contain" />
      <PixelText size={13} upper={false}>
        {amount}
      </PixelText>
      <Pressable
        onPress={onPressAdd}
        style={({ pressed }) => [
          styles.chipAdd,
          { opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <PixelText size={12} upper={false}>
          +
        </PixelText>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  btn: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#000",
    borderBottomWidth: 5,
    borderBottomColor: C.bevel,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  panel: {
    borderRadius: 16,
    borderWidth: 2,
    borderColor: C.panelBorder,
    borderBottomWidth: 4,
    borderBottomColor: C.bevel,
    backgroundColor: C.panel,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    backgroundColor: C.panel,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chipIcon: { width: 20, height: 20 },
  chipAdd: {
    marginLeft: 4,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
    backgroundColor: C.eth,
  },
})
