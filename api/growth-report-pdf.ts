// Vercel Serverless Function: Growth Report PDF Rendering
// Renders HTML growth report to PDF using Puppeteer
//
// Usage:
//   POST /api/growth-report-pdf
//   Content-Type: application/json
//
//   {
//     "reportingWeek": "September 21, 2026",
//     "networkAttendance": 82,
//     "attendanceDelta": 5,
//     "firstTimers": 6,
//     "reportingCenters": 5,
//     "totalCenters": 10,
//     "reportingPercentage": 50,
//     "trend": [...],
//     "centers": [...]
//   }

import { VercelRequest, VercelResponse } from '@vercel/node'

// Note: Puppeteer/browser rendering would be added here.
// For now, this is the skeleton. Actual implementation depends on
// choosing the renderer (Puppeteer, Playwright, or other).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).setHeader('Access-Control-Allow-Origin', '*').end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const report = req.body

    // Validation
    if (!report.reportingWeek || report.networkAttendance === undefined) {
      return res.status(400).json({ error: 'Missing required report fields' })
    }

    // TODO: Import renderGrowthReportHTML and render to PDF
    // For now, return a placeholder response
    return res.status(200).json({
      status: 'pending_renderer_implementation',
      message: 'PDF renderer not yet configured. Awaiting Puppeteer/Playwright setup.',
    })
  } catch (error) {
    console.error('Error generating PDF:', error)
    return res.status(500).json({
      error: 'Failed to generate PDF',
      details: error instanceof Error ? error.message : String(error),
    })
  }
}
