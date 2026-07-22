/**
 * Key storage — NATIVE implementation.
 *
 * The burner's secret key lives in the device keychain / keystore (Keychain on
 * iOS, EncryptedSharedPreferences backed by the Android Keystore) via
 * `expo-secure-store`, readable only once the device has been unlocked and
 * never synced off it. That's real self-custody: the key never leaves the
 * device and no server ever sees it.
 *
 * This only ever holds the *burner* key. Connect a real wallet through Mobile
 * Wallet Adapter and the keys stay in that wallet app — nothing is written here.
 *
 * Metro picks this file over storage.ts on iOS/Android automatically. Same
 * { loadSecret, saveSecret, clearSecret } interface as the web version, so
 * wallet.tsx is unchanged.
 */
import * as SecureStore from "expo-secure-store"

const opts: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
}

export async function loadSecret(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key, opts)
  } catch {
    return null // nothing stored yet, or the keystore entry is unreadable
  }
}

export async function saveSecret(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value, opts)
}

export async function clearSecret(key: string): Promise<void> {
  await SecureStore.deleteItemAsync(key, opts)
}
