/**
 * Proximity peer-to-peer over Google Nearby Connections (Bluetooth + Wi-Fi),
 * via expo-nearby-connections. This is the in-person transport for Bluetooth
 * duels: friends around a table discover each other with zero infrastructure,
 * chat, and the host broadcasts the on-chain pot everyone joins.
 *
 * Native-only (nitro module) — every export is a no-op/false on web so the
 * app and its web preview never crash. The MONEY is always on Solana; Nearby
 * only carries the social layer (chat) and a tiny coordination protocol.
 *
 * Strategy P2P_CLUSTER = many-to-many mesh, so a whole group can pot together.
 */
import { Platform } from "react-native"

export type Strategy = 1 | 2 | 3
export const P2P_CLUSTER: Strategy = 1

export interface Peer {
  peerId: string
  name: string
}
export interface Unsub {
  (): void
}

// ── the wire protocol carried over Nearby text frames ──────────────────────
export type NearbyMsg =
  | { t: "chat"; from: string; text: string; at: number }
  | { t: "duel"; poolId: string; fixtureId: number; stake: number; host: string } // host announces the pot
  | { t: "hello"; addr: string; name: string } // identity handshake (wallet address)

const isNative = Platform.OS !== "web"

// Lazily require the native module so web never touches it.
type NC = typeof import("expo-nearby-connections")
let _nc: NC | null = null
function nc(): NC | null {
  if (!isNative) return null
  if (!_nc) {
    try {
      _nc = require("expo-nearby-connections")
    } catch {
      _nc = null
    }
  }
  return _nc
}

export const nearbyAvailable = () => isNative && nc() != null

export async function playServicesOk(): Promise<boolean> {
  const m = nc()
  if (!m) return false
  try {
    return await m.isPlayServicesAvailable()
  } catch {
    return false
  }
}

// ── advertise / discover ────────────────────────────────────────────────────
export async function startAdvertise(name: string): Promise<string | null> {
  const m = nc()
  if (!m) return null
  return m.startAdvertise(name, P2P_CLUSTER as never)
}
export async function startDiscovery(name: string): Promise<string | null> {
  const m = nc()
  if (!m) return null
  return m.startDiscovery(name, P2P_CLUSTER as never)
}
export async function stopAll(): Promise<void> {
  const m = nc()
  if (!m) return
  await Promise.allSettled([m.stopAdvertise(), m.stopDiscovery()])
}

// ── connections ─────────────────────────────────────────────────────────────
export const requestConnection = (peerId: string) => nc()?.requestConnection(peerId) ?? Promise.resolve()
export const acceptConnection = (peerId: string) => nc()?.acceptConnection(peerId) ?? Promise.resolve()
export const rejectConnection = (peerId: string) => nc()?.rejectConnection(peerId) ?? Promise.resolve()
export const disconnect = (peerId?: string) => nc()?.disconnect(peerId) ?? Promise.resolve()

/** Broadcast a structured message to a set of connected peers. */
export async function broadcast(peerIds: string[], msg: NearbyMsg): Promise<void> {
  const m = nc()
  if (!m) return
  const text = JSON.stringify(msg)
  await Promise.allSettled(peerIds.map((id) => m.sendText(id, text)))
}
export async function send(peerId: string, msg: NearbyMsg): Promise<void> {
  const m = nc()
  if (!m) return
  await m.sendText(peerId, JSON.stringify(msg))
}

// ── event subscriptions (safe no-ops on web) ────────────────────────────────
export function onPeerFound(cb: (p: Peer) => void): Unsub {
  return nc()?.onPeerFound(cb) ?? (() => {})
}
export function onPeerLost(cb: (p: { peerId: string }) => void): Unsub {
  return nc()?.onPeerLost(cb) ?? (() => {})
}
export function onInvitation(cb: (p: Peer) => void): Unsub {
  return nc()?.onInvitationReceived(cb) ?? (() => {})
}
export function onConnected(cb: (p: Peer) => void): Unsub {
  return nc()?.onConnected(cb) ?? (() => {})
}
export function onDisconnected(cb: (p: { peerId: string }) => void): Unsub {
  return nc()?.onDisconnected(cb) ?? (() => {})
}
export function onMessage(cb: (peerId: string, msg: NearbyMsg) => void): Unsub {
  const m = nc()
  if (!m) return () => {}
  return m.onTextReceived(({ peerId, text }: { peerId: string; text: string }) => {
    try {
      cb(peerId, JSON.parse(text) as NearbyMsg)
    } catch {
      cb(peerId, { t: "chat", from: peerId.slice(0, 4), text, at: Date.now() })
    }
  })
}
