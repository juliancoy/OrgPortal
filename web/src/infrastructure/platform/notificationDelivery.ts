import { isNativeCapacitorRuntime } from './runtimePlatform'
import { disableWebPush, enableWebPush, getWebPushState, type WebPushState } from './webPush'

export type DeviceNotificationState = WebPushState | 'native-unconfigured'
// The inbox and read state work without device delivery. A Capacitor APNs/FCM
// adapter can replace the native branch once the signed apps are configured.
export function getDeviceNotificationState(token: string): Promise<DeviceNotificationState> {
  return isNativeCapacitorRuntime() ? Promise.resolve('native-unconfigured') : getWebPushState(token)
}
export async function enableDeviceNotifications(token: string) {
  if (isNativeCapacitorRuntime()) throw new Error('Device alerts are not connected in this mobile build.')
  await enableWebPush(token)
}
export async function disableDeviceNotifications(token: string) {
  if (isNativeCapacitorRuntime()) throw new Error('Device alerts are not connected in this mobile build.')
  await disableWebPush(token)
}
