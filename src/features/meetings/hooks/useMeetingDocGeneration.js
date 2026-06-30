import { useState } from 'react'
import { supabase } from '../../../lib/supabase'

export function useMeetingDocGeneration() {
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError]               = useState(null)

  async function generateAndUploadDoc(params) {
    setIsGenerating(true)
    setError(null)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('generate-meeting-doc', {
        body: params,
      })
      if (fnError) throw fnError
      if (!data?.success) throw new Error(data?.error || 'Doc generation failed')
      return data
    } catch (err) {
      console.error('[useMeetingDocGeneration]', err)
      const msg = err.message || 'Failed to generate meeting doc'
      setError(msg)
      throw new Error(msg)
    } finally {
      setIsGenerating(false)
    }
  }

  return { generateAndUploadDoc, isGenerating, error }
}
