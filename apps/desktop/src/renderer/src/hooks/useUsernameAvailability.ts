import { useEffect, useState } from 'react'
import { scheduleUsernameCheck, type Availability } from '../lib/usernameAvailability'

/** Disponibilidade do @ enquanto a pessoa digita (só quando `enabled`, ex.: no cadastro). */
export function useUsernameAvailability(username: string, enabled: boolean): Availability {
  const [availability, setAvailability] = useState<Availability>({ kind: 'idle' })

  useEffect(() => {
    if (!enabled) {
      setAvailability({ kind: 'idle' })
      return
    }
    return scheduleUsernameCheck(username, setAvailability)
  }, [username, enabled])

  return availability
}
