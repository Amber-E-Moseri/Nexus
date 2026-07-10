export function SpotifyPlayer({ playlistId }) {
  if (!playlistId) return null

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#9aa0a6', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        🎵 Spotify Playlist
      </div>
      <iframe
        style={{
          borderRadius: 12,
          width: '100%',
          height: 380,
          border: 'none',
        }}
        src={`https://open.spotify.com/embed/playlist/${playlistId}?utm_source=generator`}
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
      />
    </div>
  )
}
