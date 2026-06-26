import { useEffect, useState } from 'react';
import { useSupabaseClient } from '@supabase/auth-helpers-react';

export const useInstagramPages = () => {
  const supabase = useSupabaseClient();
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPages = async () => {
      try {
        setLoading(true);
        const { data, error: queryError } = await supabase
          .from('instagram_pages')
          .select('*')
          .order('created_at', { ascending: false });

        if (queryError) throw queryError;
        setPages(data || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchPages();
  }, [supabase]);

  return { pages, loading, error };
};

export const useInstagramMetrics = (pageId) => {
  const supabase = useSupabaseClient();
  const [metrics, setMetrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!pageId) {
      setMetrics([]);
      return;
    }

    const fetchMetrics = async () => {
      try {
        setLoading(true);
        const { data, error: queryError } = await supabase
          .from('instagram_metrics')
          .select('*')
          .eq('page_id', pageId)
          .order('period_start_date', { ascending: false });

        if (queryError) throw queryError;
        setMetrics(data || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, [supabase, pageId]);

  return { metrics, loading, error };
};

export const useInstagramInsights = (pageId) => {
  const supabase = useSupabaseClient();
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!pageId) {
      setInsights([]);
      return;
    }

    const fetchInsights = async () => {
      try {
        setLoading(true);
        const { data, error: queryError } = await supabase
          .from('instagram_insights')
          .select('*')
          .eq('page_id', pageId)
          .order('created_at', { ascending: false });

        if (queryError) throw queryError;
        setInsights(data || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchInsights();
  }, [supabase, pageId]);

  return { insights, loading, error };
};

export const useCostGuard = () => {
  const supabase = useSupabaseClient();
  const [costData, setCostData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchCostData = async () => {
      try {
        setLoading(true);
        const today = new Date().toISOString().split('T')[0];

        const { data, error: queryError } = await supabase
          .from('vision_cost_guard')
          .select('*')
          .eq('tracking_date', today)
          .single();

        if (queryError && queryError.code !== 'PGRST116') throw queryError;

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
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchCostData();

    // Refresh every 30 seconds
    const interval = setInterval(fetchCostData, 30000);
    return () => clearInterval(interval);
  }, [supabase]);

  return { costData, loading, error };
};

export const useExtractMetrics = () => {
  const supabase = useSupabaseClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const extract = async (pageId, imageBase64) => {
    try {
      setLoading(true);
      setError(null);

      const session = await supabase.auth.getSession();
      const response = await fetch(
        `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/extract-instagram-metrics-hybrid`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.data?.session?.access_token}`,
          },
          body: JSON.stringify({
            pageId,
            imageBase64,
            fallbackToVision: true,
          }),
        }
      );

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to extract metrics');
      }

      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { extract, loading, error };
};

export const useGradeMetrics = () => {
  const supabase = useSupabaseClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const grade = async (pageId, metricsId, metrics) => {
    try {
      setLoading(true);
      setError(null);

      const session = await supabase.auth.getSession();
      const response = await fetch(
        `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/instagram-page-grade`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.data?.session?.access_token}`,
          },
          body: JSON.stringify({
            pageId,
            metricsId,
            metrics,
          }),
        }
      );

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to grade metrics');
      }

      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { grade, loading, error };
};
