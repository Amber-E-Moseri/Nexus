import { useEffect, useState } from 'react';
import { supabase } from '../../../services/supabase';

export function DocumentsList({ meetingId, refresh }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    loadDocuments();
  }, [meetingId, refresh]);

  async function loadDocuments() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('meeting_documents')
        .select('*')
        .eq('meeting_id', meetingId)
        .order('uploaded_at', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(docId) {
    if (!confirm('Delete this document?')) return;

    setDeleting(docId);
    try {
      const { error } = await supabase.from('meeting_documents').delete().eq('id', docId);

      if (error) throw error;
      setDocuments(documents.filter((d) => d.id !== docId));
    } catch (err) {
      console.error('Failed to delete document:', err);
      alert('Failed to delete document');
    } finally {
      setDeleting(null);
    }
  }

  if (loading) return <div className="card">Loading documents...</div>;

  if (documents.length === 0) {
    return (
      <div className="card empty-state">
        <p>No documents uploaded yet</p>
      </div>
    );
  }

  return (
    <div className="documents-list card">
      <h3>📄 Meeting Documents ({documents.length})</h3>

      <div className="documents-grid">
        {documents.map((doc) => (
          <div key={doc.id} className="document-card">
            <div className="document-header">
              <span className="document-type">{doc.file_type.toUpperCase()}</span>
              <button
                onClick={() => handleDelete(doc.id)}
                disabled={deleting === doc.id}
                className="btn-remove"
                title="Delete"
              >
                {deleting === doc.id ? '⏳' : '✕'}
              </button>
            </div>

            <h4 className="document-name">{doc.file_name}</h4>

            <div className="document-meta">
              <span>{(doc.file_size / 1024 / 1024).toFixed(1)} MB</span>
              <span>•</span>
              <span>{new Date(doc.uploaded_at).toLocaleDateString()}</span>
            </div>

            {doc.document_type === 'minutes' && <span className="document-badge">📄 Minutes</span>}

            <a
              href={doc.drive_share_link}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary btn-download"
            >
              📥 Download
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
