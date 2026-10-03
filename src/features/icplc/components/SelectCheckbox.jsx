import React, { useEffect, useRef } from 'react'

/**
 * Row / header selection checkbox. Stops the click from bubbling so selecting a row never opens the drawer.
 * `indeterminate` is the header "some shown rows selected" state.
 */
export default function SelectCheckbox({ checked, indeterminate = false, onChange, label }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate && !checked }, [indeterminate, checked])
  return (
    <input
      ref={ref}
      type="checkbox"
      className="icplc-select-box"
      checked={!!checked}
      aria-label={label}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    />
  )
}
