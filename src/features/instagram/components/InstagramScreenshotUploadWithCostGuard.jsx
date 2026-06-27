import React, { useState } from 'react';
import { supabase } from '../../../lib/supabase';

const InstagramScreenshotUploadWithCostGuard = ({ pageId, onMetricsExtracted, onError }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [extractionResult, setExtractionResult] = useState(null);
  const [costGuardWarning, setCostGuardWarning] = useState(null);
  const [useCSVMode, setUseCSVMode] = useState(false);
  const [csvData, setCsvData] = useState(null);

  // Handle file selection
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setCostGuardWarning(null);
    setExtractionResult(null);

    // Create preview
    const reader = new FileReader();
    reader.onload = (event) => {
      setPreview(event.target.result);
    };
    reader.readAsDataURL(file);
  };

  // Extract metrics from screenshot
  const handleExtract = async () => {
    if (!selectedFile || !preview) {
      onError?.('Please select a screenshot');
      return;
    }

    setLoading(true);
    try {
      // Call extract-instagram-metrics-hybrid function
      const response = await fetch(
        `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/extract-instagram-metrics-hybrid`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${(await supabase.auth.getSession()).data?.session?.access_token}`,
          },
          body: JSON.stringify({
            pageId,
            imageBase64: preview.split(',')[1],
            fallbackToVision: true,
          }),
        }
      );

      const data = await response.json();

      if (!data.success) {
        if (data.costGuardTriggered) {
          setCostGuardWarning(data.error);
          setUseCSVMode(true);
        } else {
          onError?.(data.error || 'Failed to extract metrics');
        }
        return;
      }

      setExtractionResult(data);
      onMetricsExtracted?.(data.metrics);
    } catch (error) {
      onError?.(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle CSV upload (when Vision API limit hit)
  const handleCSVUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const csv = event.target.result;
        const lines = csv.split('\n').filter((l) => l.trim());
        const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());

        const rows = lines.slice(1).map((line) => {
          const values = line.split(',').map((v) => v.trim());
          return {
            followers: parseInt(values[headers.indexOf('followers')] || 0),
            avgLikes: parseInt(values[headers.indexOf('avg_likes')] || 0),
            avgComments: parseInt(values[headers.indexOf('avg_comments')] || 0),
            avgShares: parseInt(values[headers.indexOf('avg_shares')] || 0),
            engagementRate: parseFloat(values[headers.indexOf('engagement_rate')] || 0),
            postsThisPeriod: parseInt(values[headers.indexOf('posts')] || 0),
            storiesThisPeriod: parseInt(values[headers.indexOf('stories')] || 0),
          };
        });

        setCsvData(rows);
        onMetricsExtracted?.(rows[0]);
      } catch (error) {
        onError?.('Invalid CSV format');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 p-6">
      <h2 className="text-2xl font-bold">Instagram Metrics Extraction</h2>

      {/* Cost Guard Warning */}
      {costGuardWarning && (
        <div className="rounded-lg bg-yellow-50 p-4 text-yellow-800">
          <p className="font-semibold">⚠️ Daily Vision API Limit Reached</p>
          <p className="text-sm">{costGuardWarning}</p>
          <p className="mt-2 text-sm">
            💡 Solution: Use CSV bulk import mode instead
          </p>
        </div>
      )}

      {/* Mode Selection */}
      <div className="flex gap-4">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={!useCSVMode}
            onChange={() => setUseCSVMode(false)}
          />
          <span>Screenshot Upload (AI Extraction)</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={useCSVMode}
            onChange={() => setUseCSVMode(true)}
          />
          <span>CSV Bulk Import</span>
        </label>
      </div>

      {/* Screenshot Mode */}
      {!useCSVMode && (
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Instagram Screenshot
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2"
          />

          {/* Preview */}
          {preview && (
            <div className="mt-4">
              <img
                src={preview}
                alt="Preview"
                className="h-auto max-w-sm rounded-lg border border-gray-200"
              />
            </div>
          )}

          {/* Extract Button */}
          <button
            onClick={handleExtract}
            disabled={!selectedFile || loading}
            className="mt-4 rounded-lg bg-blue-600 px-6 py-2 text-white disabled:bg-gray-400"
          >
            {loading ? 'Extracting...' : 'Extract Metrics'}
          </button>
        </div>
      )}

      {/* CSV Mode */}
      {useCSVMode && (
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Import Metrics CSV
          </label>
          <p className="text-xs text-gray-600 mt-1">
            CSV should have columns: followers, avg_likes, avg_comments, avg_shares,
            engagement_rate, posts, stories
          </p>
          <input
            type="file"
            accept=".csv"
            onChange={handleCSVUpload}
            className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </div>
      )}

      {/* Results */}
      {extractionResult && (
        <div className="rounded-lg bg-green-50 p-4">
          <p className="font-semibold text-green-800">✅ Metrics Extracted</p>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-gray-600">Followers:</dt>
              <dd className="font-medium">{extractionResult.metrics?.followers}</dd>
            </div>
            <div>
              <dt className="text-gray-600">Engagement Rate:</dt>
              <dd className="font-medium">{extractionResult.metrics?.engagementRate}%</dd>
            </div>
            <div>
              <dt className="text-gray-600">Avg Likes:</dt>
              <dd className="font-medium">{extractionResult.metrics?.avgLikes}</dd>
            </div>
            <div>
              <dt className="text-gray-600">Posts (this period):</dt>
              <dd className="font-medium">{extractionResult.metrics?.postsThisPeriod}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-gray-600">
            Extracted via: {extractionResult.method === 'vision' ? '🤖 Claude Vision API' : '📷 Tesseract OCR'}
          </p>
          {extractionResult.visionTokensUsed && (
            <p className="text-xs text-gray-600">
              Tokens used: {extractionResult.visionTokensUsed}
            </p>
          )}
        </div>
      )}

      {csvData && (
        <div className="rounded-lg bg-blue-50 p-4">
          <p className="font-semibold text-blue-800">✅ CSV Imported</p>
          <p className="text-sm text-blue-700">{csvData.length} rows imported</p>
        </div>
      )}
    </div>
  );
};

export default InstagramScreenshotUploadWithCostGuard;
