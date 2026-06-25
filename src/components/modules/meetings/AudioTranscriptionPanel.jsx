import { useState } from 'react';
import { supabase } from '../../../services/supabase';
import { AudioRecorder } from './AudioRecorder';

export function AudioTranscriptionPanel({
  meetingId,
  meeting,
  onTranscriptionComplete,
}) {
  const [mode, setMode] = useState(null); // 'upload' | 'record' | null
  const [audioFile, setAudioFile] = useState(null);
  const [transcribing, setTranscribing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const ALLOWED_TYPES = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/m4a'];
  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

  function validateFile(file) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Invalid audio format. Allowed: MP3, WAV, M4A');
      return false;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError(
        `File too large (max 100 MB). Your file: ${(file.size / 1024 / 1024).toFixed(1)} MB`
      );
      return false;
    }

    return true;
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setSuccess(false);

    if (!validateFile(file)) {
      return;
    }

    setAudioFile(file);
  }

  async function handleTranscribe(audioToTranscribe = null) {
    const fileToProcess = audioToTranscribe || audioFile;

    if (!fileToProcess) {
      setError('No audio selected');
      return;
    }

    setTranscribing(true);
    setError(null);
    setProgress(0);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;

      if (!user) {
        throw new Error('Not authenticated');
      }

      // Create File object if it's a Blob (from recording)
      const fileToUpload =
        fileToProcess instanceof File
          ? fileToProcess
          : new File([fileToProcess], `recording-${Date.now()}.webm`, {
              type: 'audio/webm',
            });

      const formData = new FormData();
      formData.append('audio', fileToUpload);
      formData.append('meetingId', meetingId);

      // Simulate progress (Deepgram takes 10-30 sec)
      const progressInterval = setInterval(() => {
        setProgress((p) => Math.min(p + 10, 90));
      }, 1000);

      const response = await fetch('/functions/v1/transcribe-audio-deepgram', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
          'x-user-id': user.id,
        },
        body: formData,
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Transcription failed');
      }

      const data = await response.json();

      // Success
      setProgress(100);
      setSuccess(true);
      setAudioFile(null);
      setMode(null);

      if (onTranscriptionComplete) {
        onTranscriptionComplete({
          transcript: data.transcript,
          transcriptionRecord: data.transcriptionRecord,
          tokensUsed: data.tokensUsed,
        });
      }
    } catch (err) {
      console.error('Transcription error:', err);
      setError(err.message || 'Failed to transcribe audio');
    } finally {
      setTranscribing(false);
      setProgress(0);
    }
  }

  // Show mode selection
  if (mode === null) {
    return (
      <div className="audio-transcription-panel card">
        <h3>🎙️ Transcribe Meeting Audio</h3>
        <p className="text-muted">Choose: record live or upload a file</p>

        <div className="mode-selector">
          <button
            onClick={() => setMode('record')}
            className="mode-button record"
          >
            🎙️ Record Live
            <span className="mode-description">Capture audio now</span>
          </button>

          <span className="mode-divider">or</span>

          <button onClick={() => setMode('upload')} className="mode-button upload">
            📁 Upload File
            <span className="mode-description">MP3, WAV, M4A</span>
          </button>
        </div>
      </div>
    );
  }

  // Upload mode
  if (mode === 'upload') {
    return (
      <div className="audio-transcription-panel card">
        <button onClick={() => setMode(null)} className="btn-back">
          ← Back
        </button>

        <h3>📁 Upload Audio File</h3>
        <p className="text-muted">MP3, WAV, M4A (max 100 MB)</p>

        {/* File Input */}
        <div className="file-input-wrapper">
          <input
            type="file"
            accept="audio/mpeg,audio/wav,audio/mp4,audio/m4a"
            onChange={handleFileSelect}
            disabled={transcribing}
            className="file-input"
            id="audio-file-input"
          />
          <label htmlFor="audio-file-input" className="file-input-label">
            {audioFile ? <>📁 {audioFile.name}</> : '🎵 Choose audio file or drag & drop'}
          </label>
        </div>

        {/* File Info */}
        {audioFile && (
          <div className="file-info">
            <span className="file-name">{audioFile.name}</span>
            <span className="file-size">
              {(audioFile.size / 1024 / 1024).toFixed(1)} MB
            </span>
          </div>
        )}

        {/* Error Message */}
        {error && <div className="error-message">⚠️ {error}</div>}

        {/* Success Message */}
        {success && (
          <div className="success-message">
            ✅ Transcription complete! Extracting key points...
          </div>
        )}

        {/* Progress Bar */}
        {transcribing && (
          <div className="transcription-progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="progress-text">
              {progress < 90 ? 'Transcribing audio...' : 'Extracting insights...'}
            </span>
          </div>
        )}

        {/* Transcribe Button */}
        <button
          onClick={() => handleTranscribe()}
          disabled={transcribing || !audioFile}
          className="btn-primary"
        >
          {transcribing ? '🔄 Transcribing...' : '▶️ Transcribe Audio'}
        </button>
      </div>
    );
  }

  // Record mode
  if (mode === 'record') {
    return (
      <div className="audio-transcription-panel card">
        <button onClick={() => setMode(null)} className="btn-back">
          ← Back
        </button>

        <AudioRecorder
          onRecordingComplete={(recordedBlob) => {
            handleTranscribe(recordedBlob);
          }}
          disabled={transcribing}
        />

        {/* Progress Bar */}
        {transcribing && (
          <div className="transcription-progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="progress-text">
              {progress < 90 ? 'Transcribing audio...' : 'Extracting insights...'}
            </span>
          </div>
        )}

        {/* Error Message */}
        {error && <div className="error-message">⚠️ {error}</div>}

        {/* Success Message */}
        {success && (
          <div className="success-message">
            ✅ Transcription complete! Extracting key points...
          </div>
        )}
      </div>
    );
  }
}
