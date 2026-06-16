import { useEffect, useState } from 'react'
import { getDeptMembers } from '../lib/tasks'

export function useDeptMembers(deptId) {
  const [members, setMembers] = useState([])

  useEffect(() => {
    let active = true

    if (!deptId) {
      setMembers([])
      return () => {
        active = false
      }
    }

    getDeptMembers(deptId)
      .then((data) => {
        if (active) {
          setMembers(data)
        }
      })
      .catch((error) => {
        console.error('Failed to load department members', error)
        if (active) {
          setMembers([])
        }
      })

    return () => {
      active = false
    }
  }, [deptId])

  return members
}
