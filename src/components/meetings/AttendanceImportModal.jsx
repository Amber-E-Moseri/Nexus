import React, { useState } from 'react'
import { parseElvantoCSV } from '../../lib/csv/elvanto-attendance-parser'
import { importElvantoAttendance } from '../../lib/csv/attendanceImportLib'
import LoadingSpinner from '../ui/LoadingSpinner'
import './AttendanceImportModal.css'

export default function AttendanceImportModal({ meetingId, onClose, onSuccess }) {
  const [step, setStep] = useState('upload') // 'upload', 'preview', 'results', 'error'
  const [file, setFile] = useState(null)
  const [csvText, setCsvText] = useState('')
  const [parseResult, setParseResult] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [importResult, setImportResult] = useState(null)

  const handleFileSelect = async (e) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    if (!selectedFile.name.endsWith('.csv')) {
      setError('Please select a CSV file')
      return
    }

    try {
      const text = await selectedFile.text()
      setCsvText(text)
      setFile(selectedFile)
      setError(null)

      // Parse immediately to show preview
      const result = parseElvantoCSV(text)
      setParseResult(result)

      if (result.errors.length > 0 && result.summary.valid_records === 0) {
        setStep('error')
      } else {
        setStep('preview')
      }
    } catch (err) {
      setError(`Failed to read file: ${err.message}`)
    }
  }

  const handleImport = async () => {
    if (!parseResult || parseResult.records.length === 0) {
      setError('No valid records to import')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const result = await importElvantoAttendance(parseResult.records, meetingId)
      setImportResult(result)
      setStep('results')

      // Call success callback after a delay to show results
      if (result.imported > 0) {
        setTimeout(() => {
          onSuccess?.(result)
        }, 2000)
      }
    } catch (err) {
      setError(err.message || 'Import failed')
      setStep('error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    onClose()
  }

  return (
    <div className="attendance-import-modal-overlay">
      <div className="attendance-import-modal">
        <div className="modal-header">
          <h2>Import Attendance from Elvanto</h2>
          <button className="close-btn" onClick={handleClose}>
            ✕
          </button>
        </div>

        {step === 'upload' && (
          <div className="modal-body">
            <div className="upload-section">
              <p className="section-label">Step 1: Export CSV from Elvanto</p>
              <ol className="instructions">
                <li>Open meeting in Elvanto</li>
                <li>Go to Attendance → Export as CSV</li>
                <li>Copy/Download the CSV file</li>
              </ol>

              <div className="csv-format-info">
                <p className="info-label">Expected CSV format:</p>
                <pre className="csv-example">
                  {`Meeting,Date,Time,PersonName,PersonID,Status,Percentage
Foundation School Leads,2024-06-16,14:00,Amara D.,person_123,Present,100%
Grace M.,person_456,Present,96%`}
                </pre>
              </div>

              <div className="file-upload-box">
                <label htmlFor="csv-file" className="file-label">
                  <input
                    id="csv-file"
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    className="file-input"
                  />
                  <span className="file-upload-text">
                    {file ? `📄 ${file.name}` : '📂 Click to select CSV file'}
                  </span>
                </label>
              </div>

              {error && <div className="error-message">{error}</div>}
            </div>
          </div>
        )}

        {step === 'preview' && parseResult && (
          <div className="modal-body">
            <div className="preview-section">
              <p className="section-label">Step 2: Review CSV Data</p>

              <div className="summary-box">
                <div className="summary-row">
                  <span className="summary-label">Total records:</span>
                  <span className="summary-value">{parseResult.summary.total_rows}</span>
                </div>
                <div className="summary-row">
                  <span className="summary-label">Valid records:</span>
                  <span className="summary-value valid">{parseResult.summary.valid_records}</span>
                </div>
                {parseResult.summary.invalid_rows > 0 && (
                  <div className="summary-row">
                    <span className="summary-label">Invalid rows:</span>
                    <span className="summary-value invalid">{parseResult.summary.invalid_rows}</span>
                  </div>
                )}
              </div>

              {parseResult.records.length > 0 && (
                <div className="preview-table-box">
                  <p className="table-label">
                    Preview (showing first {Math.min(5, parseResult.records.length)} records):
                  </p>
                  <table className="preview-table">
                    <thead>
                      <tr>
                        <th>Person</th>
                        <th>Date</th>
                        <th>Status</th>
                        <th>Percentage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parseResult.records.slice(0, 5).map((record, idx) => (
                        <tr key={idx}>
                          <td>{record.person_name}</td>
                          <td>{record.date}</td>
                          <td>
                            <span className={`status-badge ${record.status}`}>
                              {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                            </span>
                          </td>
                          <td>{record.attendance_percentage ? `${record.attendance_percentage}%` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {parseResult.errors.length > 0 && (
                <div className="errors-box">
                  <p className="errors-label">
                    ⚠️ {parseResult.errors.length} row(s) with issues (will be skipped):
                  </p>
                  <ul className="errors-list">
                    {parseResult.errors.slice(0, 5).map((err, idx) => (
                      <li key={idx}>
                        Row {err.row}: {err.error}
                      </li>
                    ))}
                    {parseResult.errors.length > 5 && (
                      <li className="more-errors">
                        ... and {parseResult.errors.length - 5} more
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {error && <div className="error-message">{error}</div>}
            </div>
          </div>
        )}

        {step === 'results' && importResult && (
          <div className="modal-body">
            <div className="results-section">
              <div className="results-summary">
                {importResult.imported > 0 && (
                  <div className="result-item success">
                    <span className="result-icon">✅</span>
                    <span className="result-text">
                      Imported <strong>{importResult.imported}</strong> records
                    </span>
                  </div>
                )}

                {importResult.skipped > 0 && (
                  <div className="result-item warning">
                    <span className="result-icon">⚠️</span>
                    <span className="result-text">
                      Skipped <strong>{importResult.skipped}</strong> record(s)
                    </span>
                  </div>
                )}

                {importResult.mismatches.length > 0 && (
                  <div className="mismatches-box">
                    <p className="mismatches-label">Person mismatches:</p>
                    <ul className="mismatches-list">
                      {importResult.mismatches.map((mismatch, idx) => (
                        <li key={idx}>
                          <strong>{mismatch.person_name}</strong> — {mismatch.error}
                        </li>
                      ))}
                    </ul>
                    <p className="mismatches-hint">
                      Add these people to BLW Canada OS or fix names in Elvanto to match.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {step === 'error' && (
          <div className="modal-body">
            <div className="error-section">
              <span className="error-icon">❌</span>
              <p className="error-title">Import Error</p>
              <p className="error-text">{error}</p>

              {parseResult?.errors.length > 0 && (
                <div className="errors-box">
                  <p className="errors-label">Details:</p>
                  <ul className="errors-list">
                    {parseResult.errors.slice(0, 10).map((err, idx) => (
                      <li key={idx}>
                        Row {err.row}: {err.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="modal-footer">
          {step === 'upload' && (
            <button
              className="btn btn-secondary"
              onClick={handleClose}
            >
              Cancel
            </button>
          )}

          {step === 'preview' && (
            <>
              <button className="btn btn-secondary" onClick={() => setStep('upload')}>
                Back
              </button>
              <button
                className="btn btn-primary"
                onClick={handleImport}
                disabled={isLoading || parseResult.summary.valid_records === 0}
              >
                {isLoading ? <LoadingSpinner size="small" /> : 'Import'}
              </button>
            </>
          )}

          {(step === 'results' || step === 'error') && (
            <button className="btn btn-primary" onClick={handleClose}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
