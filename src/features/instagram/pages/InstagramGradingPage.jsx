import React, { useState } from 'react';
import { useAuth } from '@supabase/auth-helpers-react';
import InstagramScreenshotUploadWithCostGuard from '../components/InstagramScreenshotUploadWithCostGuard';
import InstagramPagesGradingDashboard from '../components/InstagramPagesGradingDashboard';
import CostGuardDashboard from '../components/CostGuardDashboard';

const InstagramGradingPage = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard'); // dashboard, upload, costguard

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-gray-600">Please sign in to access Instagram Grading</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold">📸 Instagram Grading System</h1>
          <p className="text-gray-600 text-sm">AI-powered Instagram page performance analysis</p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-gray-200 sticky top-14 z-30">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-8">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`py-3 px-2 border-b-2 font-medium transition-colors ${
                activeTab === 'dashboard'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              📊 Dashboard
            </button>
            <button
              onClick={() => setActiveTab('upload')}
              className={`py-3 px-2 border-b-2 font-medium transition-colors ${
                activeTab === 'upload'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              📤 Extract Metrics
            </button>
            <button
              onClick={() => setActiveTab('costguard')}
              className={`py-3 px-2 border-b-2 font-medium transition-colors ${
                activeTab === 'costguard'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              💰 Cost Guard
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {activeTab === 'dashboard' && <InstagramPagesGradingDashboard />}

        {activeTab === 'upload' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Extract Instagram Metrics</h2>
              <p className="text-gray-600">
                Upload a screenshot to automatically extract metrics using AI
              </p>
            </div>
            <InstagramScreenshotUploadWithCostGuard
              pageId="example-page-id"
              onMetricsExtracted={(metrics) => {
                console.log('Metrics extracted:', metrics);
              }}
              onError={(error) => {
                console.error('Error:', error);
              }}
            />
          </div>
        )}

        {activeTab === 'costguard' && <CostGuardDashboard />}
      </div>
    </div>
  );
};

export default InstagramGradingPage;
