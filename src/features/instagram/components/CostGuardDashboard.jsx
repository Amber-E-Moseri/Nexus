import React, { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

const CostGuardDashboard = () => {
  const [costData, setCostData] = useState(null);
  const [apiCalls, setApiCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('7d'); // 7 days

  // Fetch today's cost guard data
  useEffect(() => {
    const fetchCostData = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];

        const { data, error } = await supabase
          .from('vision_cost_guard')
          .select('*')
          .eq('tracking_date', today)
          .single();

        if (error && error.code !== 'PGRST116') throw error;

        setCostData(
          data || {
            tracking_date: today,
            calls_today: 0,
            tokens_today: 0,
            cost_today_usd: 0,
            daily_limit_usd: 10,
            is_limit_exceeded: false,
          }
        );
      } catch (error) {
        console.error('Error fetching cost data:', error);
      }
    };

    fetchCostData();
    const interval = setInterval(fetchCostData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [supabase]);

  // Fetch API calls
  useEffect(() => {
    const fetchApiCalls = async () => {
      try {
        const daysBack = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 1;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysBack);

        const { data, error } = await supabase
          .from('vision_api_calls')
          .select(
            `
            *,
            page:instagram_pages(handle, page_name)
          `
          )
          .gte('created_at', startDate.toISOString())
          .order('created_at', { ascending: false })
          .limit(100);

        if (error) throw error;
        setApiCalls(data || []);
      } catch (error) {
        console.error('Error fetching API calls:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchApiCalls();
  }, [supabase, timeRange]);

  if (loading) {
    return <div className="text-center py-8">Loading cost data...</div>;
  }

  const percentUsed = Math.min(
    100,
    ((costData?.cost_today_usd || 0) / (costData?.daily_limit_usd || 10)) * 100
  );

  const totalCostTimeRange = apiCalls.reduce((sum, call) => sum + (call.cost_usd || 0), 0);
  const totalTokensTimeRange = apiCalls.reduce((sum, call) => sum + (call.tokens_used || 0), 0);
  const totalCallsTimeRange = apiCalls.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Vision API Cost Guard</h1>
        <p className="text-gray-600">Monitor and control Vision API spending</p>
      </div>

      {/* Today's Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-600">Today's Cost</p>
          <p className="text-2xl font-bold">${(costData?.cost_today_usd || 0).toFixed(2)}</p>
          <p className="text-xs text-gray-500 mt-1">of ${costData?.daily_limit_usd || 10} limit</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-600">API Calls</p>
          <p className="text-2xl font-bold">{costData?.calls_today || 0}</p>
          <p className="text-xs text-gray-500 mt-1">screenshots analyzed</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-600">Tokens Used</p>
          <p className="text-2xl font-bold">{costData?.tokens_today || 0}</p>
          <p className="text-xs text-gray-500 mt-1">Vision API tokens</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-600">Status</p>
          <p className={`text-2xl font-bold ${costData?.is_limit_exceeded ? 'text-red-600' : 'text-green-600'}`}>
            {costData?.is_limit_exceeded ? '⚠️ Limited' : '✅ Active'}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {costData?.is_limit_exceeded ? 'Use CSV mode' : 'Ready for use'}
          </p>
        </div>
      </div>

      {/* Daily Progress Bar */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="font-semibold text-lg mb-4">Today's Usage Progress</h2>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-700">Daily Budget Used</span>
            <span className="font-medium">{percentUsed.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
            <div
              className={`h-full transition-all ${
                percentUsed > 90 ? 'bg-red-500' : percentUsed > 70 ? 'bg-yellow-500' : 'bg-green-500'
              }`}
              style={{ width: `${percentUsed}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-600 pt-1">
            <span>$0</span>
            <span>${costData?.daily_limit_usd || 10}</span>
          </div>
        </div>

        {costData?.is_limit_exceeded && (
          <div className="mt-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
            <p className="font-semibold">Daily limit exceeded</p>
            <p className="text-xs mt-1">
              Use CSV bulk import mode to continue extracting metrics without additional charges.
            </p>
          </div>
        )}
      </div>

      {/* Historical Data */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">API Call History</h2>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="text-sm border border-gray-300 rounded px-2 py-1"
          >
            <option value="1d">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4 mb-4 pb-4 border-b">
          <div>
            <p className="text-sm text-gray-600">Total Calls</p>
            <p className="text-xl font-bold">{totalCallsTimeRange}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Total Tokens</p>
            <p className="text-xl font-bold">{totalTokensTimeRange}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Total Cost</p>
            <p className="text-xl font-bold">${totalCostTimeRange.toFixed(2)}</p>
          </div>
        </div>

        {/* Calls Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-2 font-semibold text-gray-700">Page</th>
                <th className="text-left px-4 py-2 font-semibold text-gray-700">Type</th>
                <th className="text-right px-4 py-2 font-semibold text-gray-700">Tokens</th>
                <th className="text-right px-4 py-2 font-semibold text-gray-700">Cost</th>
                <th className="text-center px-4 py-2 font-semibold text-gray-700">Status</th>
                <th className="text-left px-4 py-2 font-semibold text-gray-700">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {apiCalls.map((call) => (
                <tr key={call.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <div className="text-sm font-medium">{call.page?.page_name}</div>
                    <div className="text-xs text-gray-500">{call.page?.handle}</div>
                  </td>
                  <td className="px-4 py-2 text-gray-700">{call.request_type.replace('_', ' ')}</td>
                  <td className="px-4 py-2 text-right text-gray-700">{call.tokens_used}</td>
                  <td className="px-4 py-2 text-right font-medium">${call.cost_usd.toFixed(4)}</td>
                  <td className="px-4 py-2 text-center">
                    <span
                      className={`text-xs font-semibold px-2 py-1 rounded-full ${
                        call.status === 'success'
                          ? 'bg-green-100 text-green-800'
                          : call.status === 'failed'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {call.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-600 text-xs">
                    {new Date(call.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {apiCalls.length === 0 && (
            <div className="text-center py-8 text-gray-600">
              <p>No API calls in this period</p>
            </div>
          )}
        </div>
      </div>

      {/* Settings */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="font-semibold text-lg mb-4">Cost Guard Settings</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Daily Limit</p>
              <p className="text-sm text-gray-600">Maximum Vision API spending per day</p>
            </div>
            <input
              type="number"
              value={costData?.daily_limit_usd || 10}
              readOnly
              className="border border-gray-300 rounded px-3 py-2 w-24 text-right"
            />
          </div>
          <p className="text-xs text-gray-500">
            💡 When limit is reached, CSV bulk import mode becomes available to continue extracting metrics
          </p>
        </div>
      </div>
    </div>
  );
};

export default CostGuardDashboard;
