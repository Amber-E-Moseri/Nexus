# Growth Report — Renderer Architecture Audit

**Date:** September 27, 2026

## Current Architecture

- **Frontend:** React 18 + Vite on Vercel
- **Backend:** Supabase PostgreSQL + Edge Functions (Deno)
- **PDF Generation:** Currently in Supabase Edge Function using pdf-lib
- **API Routes:** Vercel Serverless Functions (Node.js runtime)
- **Hosting:** Vercel

## Renderer Options Evaluated

### Option 1: Supabase Edge Functions + Deno-based PDF Library
**Pros:**
- Centralized with other backend logic
- Lightweight startup

**Cons:**
- Limited browser automation in Deno
- No native Puppeteer/Playwright support
- Difficult to render HTML/CSS to PDF reliably
- Edge Functions have stricter resource limits
- Not ideal for heavy rendering workloads

**Verdict:** ❌ Not recommended for HTML → PDF conversion

### Option 2: Vercel Serverless Functions + Puppeteer
**Pros:**
- Node.js runtime, mature ecosystem
- Puppeteer is battle-tested for PDF generation
- Vercel's serverless functions optimized for this use case
- Can handle complex HTML/CSS
- No additional external dependencies
- Fits existing deployment architecture
- Chromium support with Vercel's infrastructure

**Cons:**
- Bundle size (Chromium launcher is ~200MB, but Vercel handles this)
- Cold starts (mitigated by bundled Chromium in Vercel)

**Verdict:** ✅ **Recommended**

### Option 3: External PDF Service (Puppeteer Cloud, pdfrocket.com, etc.)
**Pros:**
- No infrastructure management
- Dedicated rendering resources

**Cons:**
- Additional external service dependency
- Potential latency
- Cost per render
- Requires API credentials management
- Not preferred for internal weekly reports

**Verdict:** ❌ Not needed at this stage

### Option 4: Playwright via Vercel
**Pros:**
- Similar to Puppeteer
- Active development

**Cons:**
- Slightly heavier than Puppeteer
- Similar bundle size and startup characteristics

**Verdict:** ⚠️ Alternative to Puppeteer, but Puppeteer is more mature

## Selected Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React)                      │
│              User requests growth report PDF             │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│         Vercel Serverless Function                      │
│    /api/growth-report-pdf (Node.js runtime)             │
│                                                          │
│   1. Receive report data via POST request               │
│   2. Validate input                                     │
│   3. Import shared GrowthReport model                   │
│   4. Render HTML via renderGrowthReportHTML()           │
│   5. Puppeteer: Render HTML → PDF Buffer                │
│   6. Return PDF as Content-Type: application/pdf        │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                   Browser/Client                        │
│            Download or render PDF file                  │
└─────────────────────────────────────────────────────────┘
```

## Shared Report Model

**Location:** `src/lib/reportModels.ts`

**Purpose:** Renderer-independent data structure that both PDF and email/dashboard can consume

**Types:**
- `GrowthReport` — Complete report data
- `ReportCenter` — Individual center metrics
- `TrendPoint` — Weekly attendance trend

**Functions:**
- `buildGrowthReport()` — Assemble report from raw center data
- `fmt()`, `delta()` — Formatting helpers

**Benefit:** No calculation duplication between pdf-lib implementation and new HTML renderer

## HTML Report Template

**Location:** `src/lib/growthReportTemplate.html`

**Features:**
- Print-optimized CSS with `@page` rules
- Page-break-inside: avoid for sections
- Print color preservation (`print-color-adjust: exact`)
- Typography hierarchy
- Single-page target for current dataset
- Responsive grid layout
- Status color coding

**Print CSS:**
```css
@page {
  size: letter;
  margin: 0.5in;
  print-color-adjust: exact;
}

@media print {
  .kpi-section, .chart-section, .table { page-break-inside: avoid; }
}
```

## HTML Renderer

**Location:** `src/lib/growthReportRenderer.ts`

**Function:** `renderGrowthReportHTML(report: GrowthReport): string`

**Responsibilities:**
- Template placeholder substitution
- Data formatting
- HTML escaping
- Status chip generation
- Table row rendering
- Sorting centers by status/attendance

## Vercel Serverless Function

**Location:** `api/growth-report-pdf.ts`

**Endpoint:** `POST /api/growth-report-pdf`

**Input:**
```json
{
  "reportingWeek": "September 21, 2026",
  "networkAttendance": 82,
  "attendanceDelta": 5,
  "firstTimers": 6,
  "reportingCenters": 5,
  "totalCenters": 10,
  "reportingPercentage": 50,
  "trend": [...],
  "centers": [...]
}
```

**Output:**
- Content-Type: `application/pdf`
- Binary PDF buffer

**Process:**
1. Validate report data
2. Call `renderGrowthReportHTML()`
3. Launch Puppeteer headless browser
4. Navigate to rendered HTML (or use direct HTML rendering)
5. Generate PDF with print settings
6. Return PDF buffer

## Implementation Roadmap

### Phase 1: Foundation (Current)
- ✅ Shared report model (`reportModels.ts`)
- ✅ HTML template with print CSS (`growthReportTemplate.html`)
- ✅ HTML renderer (`growthReportRenderer.ts`)
- ✅ Vercel function skeleton (`api/growth-report-pdf.ts`)

### Phase 2: Renderer Integration
- [ ] Add Puppeteer to project dependencies
- [ ] Implement Puppeteer launcher in Vercel function
- [ ] Handle HTML → PDF rendering
- [ ] Test with actual PDF generation
- [ ] Verify single-page layout
- [ ] Verify typography/readability at 100% zoom

### Phase 3: Integration & Migration
- [ ] Create endpoint in frontend to call `/api/growth-report-pdf`
- [ ] Add "Export PDF" button to Growth Tracking UI
- [ ] Compare output against current pdf-lib version
- [ ] Verify data parity
- [ ] User acceptance testing

### Phase 4: Cleanup (After Verification)
- [ ] Remove pdf-lib from weekly-growth-report edge function
- [ ] Update email delivery to link/attach HTML-generated PDF
- [ ] Document report generation workflow

## Deployment Notes

### Vercel Serverless Functions
- **Cold start:** ~1-3 seconds (acceptable for weekly reports)
- **Execution time:** ~5-10 seconds for PDF rendering
- **Bundle size:** Puppeteer + Chromium ~300MB (Vercel handles transparently)
- **Scaling:** Automatic via Vercel

### Configuration
- Environment variables: None required for local Puppeteer
- Timeouts: Vercel default 30s for Pro/Enterprise (sufficient)
- Memory: Default 1024MB (sufficient for PDF rendering)

## Security Considerations

- **Input validation:** Validate report data shape before rendering
- **XSS prevention:** HTML escaping in renderer
- **Resource limits:** Puppeteer inherently bounded by function timeout
- **CORS:** Function can be called from frontend without additional auth

## Testing Strategy

1. **Unit Tests:** `reportModels.ts`, `growthReportRenderer.ts`
2. **Integration Tests:** Vercel function response
3. **Visual Tests:** Actual PDF generation and inspection
4. **Data Parity Tests:** Compare current pdf-lib output with new HTML output

## Timeline

- Phase 1 (Foundation): ✅ Complete
- Phase 2 (Renderer): 1-2 hours (Puppeteer integration + testing)
- Phase 3 (Integration): 1-2 hours (UI + testing)
- Phase 4 (Cleanup): 30 minutes

**Total:** ~3-4 hours to production-ready

---

**Recommendation:** Proceed with Vercel Serverless Function + Puppeteer.
This approach aligns with existing infrastructure, is lightweight for internal reports,
and enables the polished HTML/CSS design that cannot be achieved with pdf-lib constraints.
