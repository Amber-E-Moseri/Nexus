import React, { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

const GradeBar = ({ grade, score }) => {
  const gradeColors = {
    A: 'bg-green-500',
    B: 'bg-blue-500',
    C: 'bg-yellow-500',
    D: 'bg-orange-500',
    F: 'bg-red-500',
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 rounded-lg bg-gray-200 h-6 overflow-hidden">
        <div
          className={`h-full ${gradeColors[grade]} transition-all`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={`font-bold text-lg ${gradeColors[grade].replace('bg-', 'text-')}`}>
        {grade}
      </span>
      <span className="text-sm text-gray-600">{score}</span>
    </div>
  );
};

const InstagramPagesGradingDashboard = () => {
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPage, setSelectedPage] = useState(null);
  const [insights, setInsights] = useState(null);

  // Fetch all pages with their latest insights
  useEffect(() => {
    const fetchPages = async () => {
      try {
        const { data: pagesData, error: pagesError } = await supabase
          .from('instagram_pages')
          .select('*')
          .order('created_at', { ascending: false });

        if (pagesError) throw pagesError;

        // Fetch latest insights for each page
        const pagesWithInsights = await Promise.all(
          (pagesData || []).map(async (page) => {
            const { data: insightData } = await supabase
              .from('instagram_insights')
              .select('*')
              .eq('page_id', page.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .single();

            return { ...page, latestInsight: insightData };
          })
        );

        setPages(pagesWithInsights);
      } catch (error) {
        console.error('Error fetching pages:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPages();
  }, [supabase]);

  // Fetch full insights when page selected
  useEffect(() => {
    if (!selectedPage) return;

    const fetchInsights = async () => {
      const { data, error } = await supabase
        .from('instagram_insights')
        .select(
          `
          *,
          metrics:instagram_metrics(*),
          page:instagram_pages(*)
        `
        )
        .eq('page_id', selectedPage.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (!error) {
        setInsights(data);
      }
    };

    fetchInsights();
  }, [selectedPage, supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-600">Loading pages...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Instagram Pages Grading Dashboard</h1>
        <p className="text-gray-600">Monitor performance across all {pages.length} ministry pages</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pages List */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg border border-gray-200 p-4 max-h-96 overflow-y-auto">
            <h2 className="font-semibold text-lg mb-4">Pages</h2>
            <div className="space-y-2">
              {pages.map((page) => (
                <button
                  key={page.id}
                  onClick={() => setSelectedPage(page)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedPage?.id === page.id
                      ? 'bg-blue-100 border border-blue-300'
                      : 'hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  <div className="font-medium">{page.page_name}</div>
                  <div className="text-xs text-gray-600">{page.handle}</div>
                  {page.latestInsight && (
                    <div className="mt-1 flex items-center gap-1">
                      <span className="text-sm font-bold">{page.latestInsight.overall_grade}</span>
                      <div className="flex-1 bg-gray-200 rounded h-1">
                        <div
                          className="bg-blue-500 h-1 rounded"
                          style={{
                            width: `${Math.min(100, (page.latestInsight.overall_score / 100) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Details Panel */}
        <div className="lg:col-span-2">
          {selectedPage ? (
            <div className="space-y-4">
              {/* Page Header */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h2 className="text-2xl font-bold">{selectedPage.page_name}</h2>
                <p className="text-gray-600">{selectedPage.handle}</p>
                <p className="text-sm text-gray-500 mt-1">
                  {selectedPage.followers_count.toLocaleString()} followers
                </p>
              </div>

              {/* Latest Grade */}
              {selectedPage.latestInsight && (
                <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-lg">Overall Grade</h3>
                      <span
                        className={`text-4xl font-bold ${
                          selectedPage.latestInsight.overall_grade === 'A'
                            ? 'text-green-600'
                            : selectedPage.latestInsight.overall_grade === 'B'
                            ? 'text-blue-600'
                            : selectedPage.latestInsight.overall_grade === 'C'
                            ? 'text-yellow-600'
                            : selectedPage.latestInsight.overall_grade === 'D'
                            ? 'text-orange-600'
                            : 'text-red-600'
                        }`}
                      >
                        {selectedPage.latestInsight.overall_grade}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-lg h-3 overflow-hidden">
                      <div
                        className="bg-blue-600 h-full transition-all"
                        style={{ width: `${selectedPage.latestInsight.overall_score}%` }}
                      />
                    </div>
                    <p className="text-sm text-gray-600 mt-2">
                      Score: {selectedPage.latestInsight.overall_score}/100
                    </p>
                  </div>

                  {/* Category Grades */}
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Growth</p>
                      <GradeBar
                        grade={selectedPage.latestInsight.growth_grade}
                        score={0}
                      />
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Engagement</p>
                      <GradeBar
                        grade={selectedPage.latestInsight.engagement_grade}
                        score={0}
                      />
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Content Quality</p>
                      <GradeBar
                        grade={selectedPage.latestInsight.content_quality_grade}
                        score={0}
                      />
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Consistency</p>
                      <GradeBar
                        grade={selectedPage.latestInsight.consistency_grade}
                        score={0}
                      />
                    </div>
                  </div>

                  {/* Analysis */}
                  <div className="pt-4 border-t space-y-3">
                    {selectedPage.latestInsight.strengths && (
                      <div>
                        <p className="text-sm font-semibold text-green-700">✅ Strengths</p>
                        <p className="text-sm text-gray-700">
                          {selectedPage.latestInsight.strengths}
                        </p>
                      </div>
                    )}

                    {selectedPage.latestInsight.weaknesses && (
                      <div>
                        <p className="text-sm font-semibold text-orange-700">⚠️ Areas for Improvement</p>
                        <p className="text-sm text-gray-700">
                          {selectedPage.latestInsight.weaknesses}
                        </p>
                      </div>
                    )}

                    {selectedPage.latestInsight.recommendations && (
                      <div>
                        <p className="text-sm font-semibold text-blue-700">💡 Recommendations</p>
                        <ul className="text-sm text-gray-700 space-y-1">
                          {selectedPage.latestInsight.recommendations
                            .split('|')
                            .map((rec, idx) => (
                              <li key={idx} className="list-disc list-inside">
                                {rec.trim()}
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-gray-500 pt-2">
                    Graded: {new Date(selectedPage.latestInsight.created_at).toLocaleDateString()}
                  </p>
                </div>
              )}

              {!selectedPage.latestInsight && (
                <div className="bg-gray-50 rounded-lg border border-gray-200 p-6 text-center text-gray-600">
                  <p>No grades yet. Upload metrics to get started.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-12 text-center text-gray-600">
              <p className="text-lg">Select a page to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InstagramPagesGradingDashboard;
