import { useState, useEffect, useCallback } from 'react'

type Api = Window['api']

/**
 * Read a preference value and keep it in sync with the main process.
 */
export function usePreference(key: string): unknown {
  const [value, setValue] = useState<unknown>(undefined)

  useEffect(() => {
    ;(window.api as unknown as { preferencesGet: (k: string) => Promise<{ value: unknown }> })
      .preferencesGet(key)
      .then(res => setValue(res.value))
      .catch(console.error)
  }, [key])

  return value
}

/**
 * Read + write a preference value.
 */
export function usePreferenceState<T>(
  key: string,
  defaultValue: T
): [T, (value: T) => Promise<void>] {
  const [value, setValue] = useState<T>(defaultValue)

  useEffect(() => {
    ;(window.api as unknown as { preferencesGet: (k: string) => Promise<{ value: unknown }> })
      .preferencesGet(key)
      .then(res => {
        if (res.value !== undefined && res.value !== null) {
          setValue(res.value as T)
        }
      })
      .catch(console.error)
  }, [key])

  const setAndPersist = useCallback(
    async (newValue: T) => {
      setValue(newValue)
      await (
        window.api as unknown as {
          preferencesSet: (k: string, v: unknown) => Promise<{ success: boolean }>
        }
      ).preferencesSet(key, newValue)
    },
    [key]
  )

  return [value, setAndPersist]
}
