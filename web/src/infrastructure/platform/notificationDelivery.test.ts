import { afterEach, expect, test, vi } from 'vitest'
import { getDeviceNotificationState, enableDeviceNotifications } from './notificationDelivery'

afterEach(() => vi.unstubAllGlobals())
test('native build reports its unavailable delivery adapter without asking permission', async () => {
  const permission = vi.fn()
  vi.stubGlobal('window', { Capacitor: { isNativePlatform: () => true } })
  vi.stubGlobal('Notification', { requestPermission: permission })
  expect(await getDeviceNotificationState('token')).toBe('native-unconfigured')
  await expect(enableDeviceNotifications('token')).rejects.toThrow('not connected')
  expect(permission).not.toHaveBeenCalled()
})
