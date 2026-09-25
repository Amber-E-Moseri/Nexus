/**
 * Profile Entry Points
 *
 * Test 18: openProfile(id) from any surface opens the same canonical profile.
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest'
import { render, act } from '@testing-library/react'
import React from 'react'

describe('Profile Entry Points', () => {
  it('18. openProfile(id) from different surfaces sets the same activeProfileId', async () => {
    // Import ICPLCContext to test the provider's openProfile function
    const { ICPLCProvider, useICPLC } = await import('../../features/icplc/ICPLCContext.jsx')

    let capturedContext = null
    function Consumer() {
      capturedContext = useICPLC()
      return null
    }

    const { unmount } = render(
      React.createElement(ICPLCProvider, { config: { id: 'event-1' }, accessTier: 'write' },
        React.createElement(Consumer)
      )
    )

    // Initially no profile open
    expect(capturedContext.activeProfileId).toBeNull()

    // Simulate openProfile from People page
    act(() => capturedContext.openProfile('participant-uuid-123'))
    expect(capturedContext.activeProfileId).toBe('participant-uuid-123')

    // Simulate openProfile from Board page (same profile ID)
    act(() => capturedContext.openProfile('participant-uuid-123', 'travel'))
    expect(capturedContext.activeProfileId).toBe('participant-uuid-123')
    expect(capturedContext.activeProfileTab).toBe('travel')

    // Simulate openProfile from Documentation page (same canonical component)
    act(() => capturedContext.openProfile('participant-uuid-123', 'documentation'))
    expect(capturedContext.activeProfileId).toBe('participant-uuid-123')
    expect(capturedContext.activeProfileTab).toBe('documentation')

    // closeProfile clears state
    act(() => capturedContext.closeProfile())
    expect(capturedContext.activeProfileId).toBeNull()

    unmount()
  })
})
