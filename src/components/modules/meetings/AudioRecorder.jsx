import { useState, useRef } from 'react';

export function AudioRecorder({ onRecordingComplete, disabled }) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [error, setError] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerIntervalRef = useRef(null);
  const streamRef = useRef(null);

  async function startRecording() {
    setError(null);

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      // Collect audio chunks
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // Handle recording stop
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: 'audio/webm;codecs=opus',
        });
        setRecordedBlob(audioBlob);

        // Stop microphone stream
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      timerIntervalRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    } catch (err) {
      setError(
        err.name === 'NotAllowedError'
          ? 'Microphone access denied. Check browser permissions.'
          : 'Failed to access microphone'
      );
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerIntervalRef.current);
    }
  }

  function discardRecording() {
    setRecordedBlob(null);
    setRecordingTime(0);
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  return (
    <div className="audio-recorder card">
      <h4>🎙️ Record Live Audio</h4>

      {!recordedBlob ? (
        <>
          {/* Recording Controls */}
          {!isRecording ? (
            <button
              onClick={startRecording}
              disabled={disabled}
              className="btn-record"
            >
              ● Start Recording
            </button>
          ) : (
            <div className="recording-state">
              <div className="recording-indicator">
                <span className="pulse"></span>
                Recording... {formatTime(recordingTime)}
              </div>
              <button onClick={stopRecording} className="btn-stop">
                ⏹ Stop Recording
              </button>
            </div>
          )}

          {error && <div className="error-message">{error}</div>}
        </>
      ) : (
        <>
          {/* Playback Controls */}
          <div className="recording-complete">
            <p>✅ Recording saved ({formatTime(recordingTime)})</p>
            <audio controls className="audio-preview">
              <source src={URL.createObjectURL(recordedBlob)} type="audio/webm" />
              Your browser does not support audio playback
            </audio>

            <div className="recording-actions">
              <button
                onClick={() => onRecordingComplete(recordedBlob)}
                className="btn-primary"
              >
                ✓ Use This Recording
              </button>
              <button onClick={discardRecording} className="btn-secondary">
                ✕ Discard
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
