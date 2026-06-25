import { useState } from 'react';
import { supabase } from '../../../services/supabase';
import '../../../styles/document-upload.css';

export function DocumentUploadPanel({ meetingId, meeting, onUploadComplete }) {
  const [files, setFiles] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);
  const [documentType, setDocumentType] = useState('supporting');

  const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
  const ALLOWED_TYPES = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.google-apps.document', // Google Docs
    'application/vnd.google-apps.spreadsheet', // Google Sheets
  ];

  function validateFile(file) {
    if (file.size > MAX_FILE_SIZE) {
      setError(
        `File too large (max 25 MB). Your file: ${(file.size / 1024 / 1024).toFixed(1)} MB`
      );
      return false;
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(
        `File type not supported. Allowed: PDF, JPG, PNG, Word, Excel, Google Docs/Sheets`
      );
      return false;
    }

    return true;
  }

  function handleFileSelect(e) {
    const selectedFiles = e.target.files;
    if (!selectedFiles) return;

    setError(null);

    // Validate all files
    for (let file of selectedFiles) {
      if (!validateFile(file)) {
        return;
      }
    }

    setFiles(selectedFiles);
  }

  async function handleUpload() {
    if (!files || files.length === 0) {
      setError('No files selected');
      return;
    }

    setUploading(true);
    setError(null);
    setUploadProgress(0);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    if (!token) {
      setError('Not authenticated. Please log in again.');
      setUploading(false);
      return;
    }

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Create FormData for file upload
        const formData = new FormData();
        formData.append('file', file);
        formData.append('meetingId', meetingId);
        formData.append('documentType', documentType);

        // Call edge function
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-document-to-drive`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: formData,
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Upload failed');
        }

        const result = await response.json();

        // Update progress
        setUploadProgress(Math.round(((i + 1) / files.length) * 100));

        if (onUploadComplete) {
          onUploadComplete(result.document);
        }
      }

      // Success
      setFiles(null);
      const fileInput = document.querySelector('[data-testid="document-file-input"]');
      if (fileInput) fileInput.value = '';
      setUploadProgress(0);
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.message || 'Upload failed');
      setUploading(false);
      return;
    }

    setUploading(false);
  }

  return (
    <div className="document-upload-panel card">
      <h3>📎 Upload Supporting Documents</h3>
      <p className="text-muted">PDF, images, Word, or Excel files (max 25 MB each)</p>

      {/* Document Type */}
      <div className="form-group">
        <label>Document Type:</label>
        <select
          value={documentType}
          onChange={(e) => setDocumentType(e.target.value)}
          disabled={uploading}
          className="document-type-select"
        >
          <option value="supporting">Supporting Document</option>
          <option value="minutes">Minutes (auto-saved separately)</option>
        </select>
      </div>

      {/* File Input */}
      <div className="file-input-wrapper">
        <input
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx"
          onChange={handleFileSelect}
          disabled={uploading}
          className="file-input"
          data-testid="document-file-input"
        />
        <label className="file-input-label">
          {files && files.length > 0 ? `${files.length} file(s) selected` : '📁 Choose files or drag & drop'}
        </label>
      </div>

      {/* File List */}
      {files && files.length > 0 && (
        <div className="file-list">
          {Array.from(files).map((file, i) => (
            <div key={i} className="file-item">
              <span>{file.name}</span>
              <span className="file-size">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
            </div>
          ))}
        </div>
      )}

      {/* Error Message */}
      {error && <div className="error-message">⚠️ {error}</div>}

      {/* Upload Progress */}
      {uploading && (
        <div className="upload-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
          </div>
          <span className="progress-text">{uploadProgress}% uploaded...</span>
        </div>
      )}

      {/* Upload Button */}
      <button
        onClick={handleUpload}
        disabled={uploading || !files || files.length === 0}
        className="btn-primary btn-upload"
      >
        {uploading ? '⏳ Uploading...' : '☁️ Upload to Drive'}
      </button>

      <p className="help-text">
        Files are saved to Google Drive and linked to this meeting. Everyone who can see the meeting can access these
        files.
      </p>
    </div>
  );
}
