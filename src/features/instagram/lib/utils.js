/**
 * Convert numeric score to letter grade
 */
export const scoreToGrade = (score) => {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
};

/**
 * Get color for grade
 */
export const getGradeColor = (grade) => {
  const colors = {
    A: 'bg-green-500',
    B: 'bg-blue-500',
    C: 'bg-yellow-500',
    D: 'bg-orange-500',
    F: 'bg-red-500',
  };
  return colors[grade] || colors.F;
};

/**
 * Get text color for grade
 */
export const getGradeTextColor = (grade) => {
  const colors = {
    A: 'text-green-600',
    B: 'text-blue-600',
    C: 'text-yellow-600',
    D: 'text-orange-600',
    F: 'text-red-600',
  };
  return colors[grade] || colors.F;
};

/**
 * Format currency
 */
export const formatCurrency = (amount) => {
  return `$${amount.toFixed(2)}`;
};

/**
 * Format date
 */
export const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

/**
 * Format datetime
 */
export const formatDateTime = (dateString) => {
  return new Date(dateString).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

/**
 * Format number with commas
 */
export const formatNumber = (num) => {
  return num.toLocaleString('en-US');
};

/**
 * Parse CSV text to array of objects
 */
export const parseCSV = (csvText) => {
  const lines = csvText.split('\n').filter((l) => l.trim());
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());

  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim());
    return {
      followers: parseInt(values[headers.indexOf('followers')] || 0),
      followerGrowth: parseFloat(values[headers.indexOf('follower_growth')] || 0),
      avgLikes: parseInt(values[headers.indexOf('avg_likes')] || 0),
      avgComments: parseInt(values[headers.indexOf('avg_comments')] || 0),
      avgShares: parseInt(values[headers.indexOf('avg_shares')] || 0),
      engagementRate: parseFloat(values[headers.indexOf('engagement_rate')] || 0),
      postsThisPeriod: parseInt(values[headers.indexOf('posts')] || 0),
      storiesThisPeriod: parseInt(values[headers.indexOf('stories')] || 0),
      avgPostQuality: parseFloat(values[headers.indexOf('avg_post_quality')] || 0),
    };
  });
};

/**
 * Validate metrics object
 */
export const validateMetrics = (metrics) => {
  const required = [
    'followers',
    'avgLikes',
    'avgComments',
    'avgShares',
    'engagementRate',
    'postsThisPeriod',
    'storiesThisPeriod',
  ];

  return required.every((field) => metrics.hasOwnProperty(field) && metrics[field] !== undefined);
};

/**
 * Calculate engagement rate if not provided
 */
export const calculateEngagementRate = (avgLikes, avgComments, avgShares, followers) => {
  if (followers === 0) return 0;
  const totalEngagement = avgLikes + avgComments + avgShares;
  return ((totalEngagement / followers) * 100).toFixed(2);
};
