import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../hooks/useAuth';

const InstagramGradingPage = () => {
  const { role } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [pages, setPages] = useState([]);
  const [costData, setCostData] = useState({
    today: 0,
    todayLimit: 10,
    monthTotal: 0,
    callHistory: [],
  });
  const [extractedData, setExtractedData] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [costLimitForm, setCostLimitForm] = useState({ dailyLimit: 10 });
  const [isEditingLimits, setIsEditingLimits] = useState(false);
  const fileInputRef = useRef(null);

  const userRole = role;

  useEffect(() => {
    fetchPages();
    fetchCostData();
  }, []);

  const fetchPages = async () => {
    const { data, error: err } = await supabase
      .from('instagram_pages')
      .select(`
        id, page_name, handle, followers_count, status, created_at,
        instagram_insights ( overall_grade, overall_score, created_at )
      `)
      .order('created_at', { ascending: false });

    if (err) { console.error('Error fetching pages:', err); return; }

    setPages((data || []).map(page => ({
      ...page,
      latestInsight: (page.instagram_insights || []).sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      )[0] ?? null,
    })));
  };

  const fetchCostData = async () => {
    const today = new Date().toISOString().split('T')[0];

    const { data: guardData } = await supabase
      .from('vision_cost_guard')
      .select('cost_today_usd, daily_limit_usd')
      .eq('tracking_date', today)
      .single();

    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const { data: monthData } = await supabase
      .from('vision_api_calls')
      .select('cost_usd')
      .gte('created_at', monthStart);
    const monthTotal = (monthData || []).reduce((sum, c) => sum + (c.cost_usd || 0), 0);

    const { data: historyData } = await supabase
      .from('vision_api_calls')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    const todayLimit = guardData?.daily_limit_usd || 10;
    setCostData({
      today: guardData?.cost_today_usd || 0,
      todayLimit,
      monthTotal,
      callHistory: historyData || [],
    });
    setCostLimitForm({ dailyLimit: todayLimit });
  };

  const handleExtractMetrics = async (file) => {
    if (!file) return;
    setExtracting(true);
    setExtractProgress(0);
    setError('');
    setSuccess('');

    try {
      setExtractProgress(20);
      const fileName = `instagram-${Date.now()}.${file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage
        .from('instagram-screenshots')
        .upload(fileName, file);
      if (uploadError) throw uploadError;

      setExtractProgress(40);
      const imageBase64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = (e) => res(e.target.result.split(',')[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });

      setExtractProgress(60);
      const { data: visionData, error: visionError } = await supabase.functions.invoke(
        'extract-instagram-metrics-hybrid',
        { body: { imageBase64, pageId: null, fallbackToVision: true } }
      );
      if (visionError) throw visionError;
      if (visionData.costGuardTriggered) throw new Error('Daily API limit reached. Try again tomorrow.');
      if (!visionData.success) throw new Error(visionData.error || 'Extraction failed');

      setExtractProgress(100);
      setExtractedData(visionData.metrics);
      setSuccess('✅ Metrics extracted successfully!');
      fetchCostData();

      setTimeout(() => {
        setExtractProgress(0);
        setExtracting(false);
      }, 1000);
    } catch (err) {
      setError(err.message || 'Failed to extract metrics');
      setExtracting(false);
    }
  };

  const handleUpdateCostLimits = async () => {
    if (userRole !== 'super_admin') {
      setError('Only super admins can modify cost limits');
      return;
    }
    try {
      const today = new Date().toISOString().split('T')[0];
      const { error: err } = await supabase
        .from('vision_cost_guard')
        .upsert([{
          tracking_date: today,
          daily_limit_usd: parseFloat(costLimitForm.dailyLimit),
          updated_at: new Date().toISOString(),
        }], { onConflict: 'tracking_date' });
      if (err) throw err;
      setSuccess('✅ Daily limit updated!');
      setIsEditingLimits(false);
      fetchCostData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to update cost limits');
    }
  };

  const getStatus = (current, limit) => {
    const percent = (current / limit) * 100;
    if (percent >= 80) return { status: '⚠️ Warning', color: '#F06449', bgColor: '#FEE8E6' };
    if (percent >= 50) return { status: '📊 Moderate', color: '#E8A020', bgColor: '#FEF5E6' };
    return { status: '✅ On Track', color: '#2E7D32', bgColor: '#E8F5E9' };
  };

  const s = {
    container: { display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' },
    header: { padding: 24, borderBottom: '1px solid #EDE8DC', backgroundColor: '#fafaf8' },
    headerTitle: { fontSize: 20, fontWeight: 800, color: '#2D2A22', marginBottom: 4 },
    headerSubtitle: { fontSize: 13, color: '#7A6F5E' },
    tabBar: { display: 'flex', gap: 24, padding: '16px 24px', borderBottom: '1px solid #EDE8DC', backgroundColor: '#fafaf8' },
    tabButton: { padding: '8px 0', border: 'none', backgroundColor: 'transparent', color: '#7A6F5E', fontSize: 13, fontWeight: 600, cursor: 'pointer', borderBottom: '2px solid transparent', transition: 'all 0.2s ease' },
    tabButtonActive: { color: '#4C2A92', fontWeight: 700, borderBottomColor: '#4C2A92' },
    contentArea: { flex: 1, overflow: 'auto', padding: 24 },
    card: { backgroundColor: '#fafaf8', borderRadius: 8, padding: 20, border: '1px solid #EDE8DC', marginBottom: 16 },
    cardTitle: { fontSize: 14, fontWeight: 700, color: '#2D2A22', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 },
    metricGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 },
    metricCard: { backgroundColor: '#fff', padding: 16, borderRadius: 6, border: '1px solid #E9E4D8' },
    metricLabel: { fontSize: 12, color: '#7A6F5E', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' },
    metricValue: { fontSize: 24, fontWeight: 700, color: '#2D2A22' },
    progressBar: { width: '100%', height: 8, backgroundColor: '#E9E4D8', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
    progressFill: { height: '100%', transition: 'width 0.3s ease' },
    statusBadge: { display: 'inline-block', padding: '6px 12px', borderRadius: 4, fontSize: 11, fontWeight: 600 },
    button: { padding: '10px 16px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s ease' },
    buttonPrimary: { backgroundColor: '#4C2A92', color: '#fff' },
    buttonSecondary: { backgroundColor: '#EDE8DC', color: '#2D2A22' },
    fileInput: { display: 'none' },
    fileInputLabel: { display: 'block', padding: 32, borderRadius: 8, border: '2px dashed #E9E4D8', backgroundColor: '#fff', cursor: 'pointer', textAlign: 'center', fontSize: 13, color: '#7A6F5E', transition: 'all 0.2s ease' },
    errorMessage: { padding: '12px 16px', backgroundColor: '#FEE8E6', borderRadius: 6, color: '#C73B2B', fontSize: 13, borderLeft: '3px solid #C73B2B', marginBottom: 16 },
    successMessage: { padding: '12px 16px', backgroundColor: '#E8F5E9', borderRadius: 6, color: '#2E7D32', fontSize: 13, borderLeft: '3px solid #2E7D32', marginBottom: 16 },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
    tableHeader: { backgroundColor: '#fafaf8', borderBottom: '2px solid #EDE8DC', fontWeight: 600, color: '#2D2A22', textAlign: 'left', padding: 12 },
    tableCell: { padding: 12, borderBottom: '1px solid #EDE8DC', color: '#2D2A22' },
    formLabel: { display: 'block', fontSize: 12, fontWeight: 600, color: '#2D2A22', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' },
    formInput: { width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #EDE8DC', fontSize: 13, fontFamily: 'inherit', color: '#2D2A22', boxSizing: 'border-box' },
    warningBox: { padding: '12px 16px', backgroundColor: '#FEF5E6', borderRadius: 6, borderLeft: '3px solid #E8A020', fontSize: 12, color: '#7A6F5E', marginTop: 12 },
    restrictedMessage: { padding: 16, backgroundColor: '#F5F2ED', borderRadius: 6, textAlign: 'center', color: '#7A6F5E', fontSize: 13, border: '1px solid #EDE8DC' },
  };

  return (
    <div style={s.container}>
      {/* HEADER */}
      <div style={s.header}>
        <h2 style={s.headerTitle}>📸 Instagram Grading System</h2>
        <p style={s.headerSubtitle}>AI-powered Instagram page performance analysis</p>
      </div>

      {/* TAB BAR */}
      <div style={s.tabBar}>
        {[
          { id: 'dashboard', label: '📊 Dashboard' },
          { id: 'extract', label: '📈 Extract Metrics' },
          { id: 'costs', label: '💰 Cost Guard' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{ ...s.tabButton, ...(activeTab === tab.id ? s.tabButtonActive : {}) }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* CONTENT */}
      <div style={s.contentArea}>
        {error && <div style={s.errorMessage}>{error}</div>}
        {success && <div style={s.successMessage}>{success}</div>}

        {/* ── DASHBOARD ── */}
        {activeTab === 'dashboard' && (
          <div>
            {pages.length === 0 ? (
              <div style={s.card}>
                <div style={{ textAlign: 'center', padding: 32 }}>
                  <p style={{ fontSize: 16, fontWeight: 600, color: '#2D2A22', marginBottom: 8 }}>
                    📸 No pages monitored yet
                  </p>
                  <p style={{ fontSize: 13, color: '#7A6F5E', marginBottom: 16 }}>
                    Get started by uploading your first Instagram screenshot
                  </p>
                  <button style={{ ...s.button, ...s.buttonPrimary }} onClick={() => setActiveTab('extract')}>
                    Go to Extract Metrics
                  </button>
                </div>
              </div>
            ) : (
              pages.map((page) => (
                <div key={page.id} style={s.card}>
                  <h3 style={s.cardTitle}>📷 {page.page_name}</h3>
                  <div style={{ fontSize: 12, color: '#7A6F5E', marginTop: -12, marginBottom: 12 }}>{page.handle}</div>

                  <div style={s.metricGrid}>
                    <div style={s.metricCard}>
                      <div style={s.metricLabel}>👥 Followers</div>
                      <div style={s.metricValue}>{(page.followers_count || 0).toLocaleString()}</div>
                    </div>
                    <div style={s.metricCard}>
                      <div style={s.metricLabel}>⭐ Latest Grade</div>
                      <div style={s.metricValue}>{page.latestInsight?.overall_grade ?? '—'}</div>
                      {page.latestInsight && (
                        <div style={{ fontSize: 12, color: '#7A6F5E', marginTop: 4 }}>
                          Score: {page.latestInsight.overall_score}/100
                        </div>
                      )}
                    </div>
                    <div style={s.metricCard}>
                      <div style={s.metricLabel}>🔄 Status</div>
                      <div style={{ ...s.statusBadge, backgroundColor: page.status === 'active' ? '#E8F5E9' : '#FEE8E6', color: page.status === 'active' ? '#2E7D32' : '#C73B2B', marginTop: 4 }}>
                        {page.status}
                      </div>
                    </div>
                  </div>

                  <button style={{ ...s.button, ...s.buttonSecondary }} onClick={() => setActiveTab('extract')}>
                    Upload New Screenshot
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── EXTRACT ── */}
        {activeTab === 'extract' && (
          <div>
            <div style={s.card}>
              <h3 style={s.cardTitle}>📈 Extract Instagram Metrics</h3>
              <p style={{ fontSize: 13, color: '#7A6F5E', marginBottom: 16 }}>
                Upload a screenshot to automatically extract metrics using AI
              </p>

              <input
                type="file"
                ref={fileInputRef}
                accept="image/png,image/jpeg,image/jpg"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleExtractMetrics(f); }}
                style={s.fileInput}
                id="screenshot-input"
                disabled={extracting}
              />
              <label
                htmlFor="screenshot-input"
                style={s.fileInputLabel}
                onMouseEnter={(e) => { if (!extracting) { e.currentTarget.style.borderColor = '#4C2A92'; e.currentTarget.style.backgroundColor = '#F5F2ED'; } }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E9E4D8'; e.currentTarget.style.backgroundColor = '#fff'; }}
              >
                {extracting ? '🔄 Processing...' : '📷 Drag & drop or click to upload screenshot'}
                <div style={{ fontSize: 11, marginTop: 4, color: '#7A6F5E' }}>PNG, JPG (max 10 MB)</div>
              </label>

              {extracting && (
                <div style={{ marginTop: 16 }}>
                  <div style={s.progressBar}>
                    <div style={{ ...s.progressFill, width: `${extractProgress}%`, backgroundColor: '#4C2A92' }} />
                  </div>
                  <p style={{ fontSize: 12, color: '#7A6F5E', marginTop: 8 }}>{extractProgress}% complete</p>
                </div>
              )}
            </div>

            {extractedData && (
              <div style={s.card}>
                <h3 style={s.cardTitle}>✨ Extracted Metrics</h3>
                <div style={s.metricGrid}>
                  <div style={s.metricCard}>
                    <div style={s.metricLabel}>👥 Followers</div>
                    <div style={s.metricValue}>{(extractedData.followers || 0).toLocaleString()}</div>
                  </div>
                  <div style={s.metricCard}>
                    <div style={s.metricLabel}>❤️ Avg Likes</div>
                    <div style={s.metricValue}>{(extractedData.avgLikes || 0).toLocaleString()}</div>
                  </div>
                  <div style={s.metricCard}>
                    <div style={s.metricLabel}>💬 Avg Comments</div>
                    <div style={s.metricValue}>{(extractedData.avgComments || 0).toLocaleString()}</div>
                  </div>
                  <div style={s.metricCard}>
                    <div style={s.metricLabel}>📊 Engagement Rate</div>
                    <div style={s.metricValue}>{(extractedData.engagementRate || 0).toFixed(1)}%</div>
                  </div>
                  <div style={s.metricCard}>
                    <div style={s.metricLabel}>📝 Posts (period)</div>
                    <div style={s.metricValue}>{extractedData.postsThisPeriod || 0}</div>
                  </div>
                  <div style={s.metricCard}>
                    <div style={s.metricLabel}>📖 Stories (period)</div>
                    <div style={s.metricValue}>{extractedData.storiesThisPeriod || 0}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <button style={{ ...s.button, ...s.buttonSecondary }} onClick={() => setExtractedData(null)}>
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── COST GUARD ── */}
        {activeTab === 'costs' && (
          <div>
            {/* Today */}
            <div style={s.card}>
              <h3 style={s.cardTitle}>📊 Today's Status</h3>
              <div style={s.metricGrid}>
                <div style={s.metricCard}>
                  <div style={s.metricLabel}>Current Cost</div>
                  <div style={s.metricValue}>${costData.today.toFixed(2)}</div>
                  <div style={{ fontSize: 11, color: '#7A6F5E', marginTop: 4 }}>of ${costData.todayLimit} limit</div>
                </div>
                <div style={s.metricCard}>
                  <div style={s.metricLabel}>API Calls</div>
                  <div style={s.metricValue}>{costData.callHistory.length}</div>
                  <div style={{ fontSize: 11, color: '#7A6F5E', marginTop: 4 }}>screenshots analyzed</div>
                </div>
                <div style={s.metricCard}>
                  <div style={s.metricLabel}>Status</div>
                  <div style={{ ...s.statusBadge, ...{ backgroundColor: getStatus(costData.today, costData.todayLimit).bgColor, color: getStatus(costData.today, costData.todayLimit).color, marginTop: 4 } }}>
                    {getStatus(costData.today, costData.todayLimit).status}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <div style={s.metricLabel}>Daily Budget Used</div>
                <div style={s.progressBar}>
                  <div style={{
                    ...s.progressFill,
                    width: `${Math.min((costData.today / costData.todayLimit) * 100, 100)}%`,
                    backgroundColor: (costData.today / costData.todayLimit) >= 0.8 ? '#F06449' : (costData.today / costData.todayLimit) >= 0.5 ? '#E8A020' : '#2E7D32',
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: '#7A6F5E' }}>
                  <span>$0</span>
                  <span style={{ fontWeight: 600 }}>{Math.round((costData.today / costData.todayLimit) * 100)}%</span>
                  <span>${costData.todayLimit}</span>
                </div>
              </div>
            </div>

            {/* Month */}
            <div style={s.card}>
              <h3 style={s.cardTitle}>📈 This Month</h3>
              <div style={s.metricGrid}>
                <div style={s.metricCard}>
                  <div style={s.metricLabel}>Month Total</div>
                  <div style={s.metricValue}>${costData.monthTotal.toFixed(2)}</div>
                </div>
                <div style={s.metricCard}>
                  <div style={s.metricLabel}>API Calls</div>
                  <div style={s.metricValue}>{costData.callHistory.length}</div>
                  <div style={{ fontSize: 11, color: '#7A6F5E', marginTop: 4 }}>this month</div>
                </div>
              </div>
            </div>

            {/* Call History */}
            <div style={s.card}>
              <h3 style={s.cardTitle}>🔍 API Call History</h3>
              {costData.callHistory.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#7A6F5E', fontSize: 13, padding: 24 }}>No API calls yet</p>
              ) : (
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.tableHeader}>Date</th>
                      <th style={s.tableHeader}>Type</th>
                      <th style={s.tableHeader}>Cost</th>
                      <th style={s.tableHeader}>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costData.callHistory.slice(0, 20).map((call) => (
                      <tr key={call.id}>
                        <td style={s.tableCell}>{new Date(call.created_at).toLocaleDateString()}</td>
                        <td style={s.tableCell}>{call.request_type?.replace('_', ' ') ?? '—'}</td>
                        <td style={s.tableCell}>${(call.cost_usd || 0).toFixed(4)}</td>
                        <td style={s.tableCell}>{new Date(call.created_at).toLocaleTimeString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Settings — super admin only */}
            <div style={s.card}>
              <h3 style={s.cardTitle}>⚙️ Cost Guard Settings</h3>
              {userRole !== 'super_admin' ? (
                <div style={s.restrictedMessage}>🔒 Only super admins can modify cost limits</div>
              ) : (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label style={s.formLabel}>Daily Limit ($)</label>
                    <input
                      type="number"
                      style={s.formInput}
                      value={costLimitForm.dailyLimit}
                      onChange={(e) => setCostLimitForm({ dailyLimit: e.target.value })}
                      disabled={!isEditingLimits}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 12 }}>
                    {!isEditingLimits ? (
                      <button style={{ ...s.button, ...s.buttonPrimary }} onClick={() => setIsEditingLimits(true)}>
                        ✏️ Edit Limits
                      </button>
                    ) : (
                      <>
                        <button style={{ ...s.button, ...s.buttonPrimary }} onClick={handleUpdateCostLimits}>
                          💾 Save Changes
                        </button>
                        <button style={{ ...s.button, ...s.buttonSecondary }} onClick={() => setIsEditingLimits(false)}>
                          Cancel
                        </button>
                      </>
                    )}
                  </div>

                  <div style={s.warningBox}>
                    💡 Note: Cost limits apply to all team members. Set conservative limits to prevent unexpected API charges.
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InstagramGradingPage;
