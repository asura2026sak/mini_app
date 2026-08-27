import React, { useState, useEffect } from 'react'
import { 
  Download, 
  Music, 
  Heart, 
  MessageCircle, 
  Share2, 
  Play, 
  AlertCircle, 
  Clipboard, 
  X, 
  Link2, 
  Sparkles, 
  Check,
  Tv
} from 'lucide-react'

interface VideoStats {
  plays: number
  likes: number
  comments: number
  shares: number
}

interface VideoData {
  success: boolean
  title: string
  thumbnail: string
  videoUrl: string
  downloadUrl: string
  author: string
  stats: VideoStats
  music: string
  isDemo?: boolean
  message?: string
}

// Telegram WebApp global helper
const tg = (window as any).Telegram?.WebApp

export default function App() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [videoData, setVideoData] = useState<VideoData | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadSuccess, setDownloadSuccess] = useState(false)

  // Telegram Integration States
  const [isTelegram, setIsTelegram] = useState(false)
  const [tgUser, setTgUser] = useState<any>(null)

  // Initialize Telegram WebApp SDK
  useEffect(() => {
    if (tg && tg.platform !== 'unknown') {
      setIsTelegram(true)
      tg.ready()
      tg.expand()
      setTgUser(tg.initDataUnsafe?.user || null)
      document.body.classList.add('telegram-theme')
      
      if (tg.setHeaderColor) {
        tg.setHeaderColor('secondary_bg_color')
      }
    }
  }, [])

  const validateUrl = (testUrl: string) => {
    if (!testUrl.trim()) return false
    return /^https?:\/\/(?:[a-z0-9-]+\.)?tiktok\.com\/./i.test(testUrl)
  }

  const handlePaste = async () => {
    tg?.HapticFeedback?.impactOccurred('light')
    try {
      const text = await navigator.clipboard.readText()
      setUrl(text)
      setError(null)
    } catch (err) {
      setError('Could not access clipboard. Please paste manually.')
    }
  }

  const handleClear = () => {
    tg?.HapticFeedback?.impactOccurred('light')
    setUrl('')
    setError(null)
  }

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M'
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K'
    }
    return num.toString()
  }

  // Core metadata fetching function
  const fetchVideoMetadata = async () => {
    if (!url.trim()) {
      setError('Please paste a TikTok video URL first.')
      tg?.HapticFeedback?.notificationOccurred('error')
      return
    }

    if (!validateUrl(url)) {
      setError('Invalid TikTok link. URL must contain "tiktok.com".')
      tg?.HapticFeedback?.notificationOccurred('error')
      return
    }

    setLoading(true)
    setError(null)
    setVideoData(null)
    setDownloadSuccess(false)

    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url: url.trim() })
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to parse video. Please try again.')
      }

      setVideoData(data)
      tg?.HapticFeedback?.notificationOccurred('success')
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.')
      tg?.HapticFeedback?.notificationOccurred('error')
    } finally {
      setLoading(false)
    }
  }

  const handleFetchMetadata = (e: React.FormEvent) => {
    e.preventDefault()
    fetchVideoMetadata()
  }

  const triggerDownload = () => {
    if (!videoData) return
    setDownloading(true)
    tg?.HapticFeedback?.impactOccurred('medium')
    
    window.location.href = videoData.downloadUrl

    setTimeout(() => {
      setDownloading(false)
      setDownloadSuccess(true)
      tg?.HapticFeedback?.notificationOccurred('success')
      setTimeout(() => setDownloadSuccess(false), 4000)
    }, 2000)
  }

  // Dynamic Telegram Main Button Sync
  useEffect(() => {
    if (!isTelegram || !tg) return

    if (loading) {
      tg.MainButton.setText('Resolving video details...')
      tg.MainButton.showProgress(true)
      tg.MainButton.disable()
      tg.MainButton.show()
    } else if (videoData) {
      tg.MainButton.setText('DOWNLOAD MP4 (NO WATERMARK)')
      tg.MainButton.hideProgress()
      tg.MainButton.enable()
      tg.MainButton.setParams({
        color: tg.themeParams.button_color || '#8b5cf6',
        text_color: tg.themeParams.button_text_color || '#ffffff'
      })
      tg.MainButton.show()
    } else if (validateUrl(url)) {
      tg.MainButton.setText('GET DOWNLOAD LINKS')
      tg.MainButton.hideProgress()
      tg.MainButton.enable()
      tg.MainButton.setParams({
        color: tg.themeParams.button_color || '#8b5cf6',
        text_color: tg.themeParams.button_text_color || '#ffffff'
      })
      tg.MainButton.show()
    } else {
      tg.MainButton.hide()
    }
  }, [url, loading, videoData, isTelegram])

  // Bind Telegram Main Button Click Handler
  useEffect(() => {
    if (!isTelegram || !tg) return

    const handleMainButtonClick = () => {
      if (videoData) {
        triggerDownload()
      } else {
        fetchVideoMetadata()
      }
    }

    tg.MainButton.onClick(handleMainButtonClick)
    return () => {
      tg.MainButton.offClick(handleMainButtonClick)
    }
  }, [url, videoData, isTelegram])

  return (
    <div className="app-container">
      {/* Top Header Section */}
      <header className="header">
        <div className="logo-container">
          <div className="logo-box">
            <Download className="logo-icon" />
          </div>
          <div>
            <h1 className="brand-text">
              TokSave
              <span className="pro-badge">WebApp</span>
            </h1>
            <p className="brand-subtitle">High-speed media archiver</p>
          </div>
        </div>

        {/* Welcome logged-in Telegram User */}
        {isTelegram && tgUser ? (
          <div className="tg-user-chip">
            {tgUser.photo_url ? (
              <img src={tgUser.photo_url} alt="" className="tg-user-avatar" />
            ) : (
              <div className="tg-user-initials">
                {(tgUser.first_name || 'U').substring(0, 1).toUpperCase()}
              </div>
            )}
            <span className="tg-user-name">Hi, {tgUser.first_name}!</span>
          </div>
        ) : (
          <div className="badge-container">
            <span className="badge">
              <Sparkles className="badge-icon badge-pink" />
              No Watermark
            </span>
            <span className="badge">
              <Tv className="badge-icon badge-purple" />
              Full HD MP4
            </span>
          </div>
        )}
      </header>

      {/* Main Body Content */}
      <main className="main-content">
        
        {/* URL Input Form Card */}
        <div className="glass-card main-card">
          <div className="card-header">
            <h2 className="card-title">TikTok Video Downloader</h2>
            <p className="card-subtitle">
              Paste the link of the video you want to download without a watermark.
            </p>
          </div>

          <form onSubmit={handleFetchMetadata} className="input-form">
            <div className="input-group">
              <div className="input-icon-wrapper">
                <Link2 className="input-icon" />
              </div>
              
              <input
                id="tiktok-url-input"
                type="text"
                placeholder="https://www.tiktok.com/@username/video/..."
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value)
                  if (error) setError(null)
                }}
                className="text-input"
              />

              <div className="input-actions">
                {url && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="clear-btn"
                    title="Clear link"
                  >
                    <X className="action-icon" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handlePaste}
                  className="paste-btn"
                  title="Paste from clipboard"
                >
                  <Clipboard className="action-icon-small" />
                  Paste
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="error-banner">
                <AlertCircle className="error-icon" />
                <span>{error}</span>
              </div>
            )}

            {/* Hide standard button in Telegram to prefer the native bottom MainButton */}
            {!isTelegram && (
              <button
                id="fetch-video-btn"
                type="submit"
                disabled={loading}
                className={`primary-btn ${loading ? 'btn-loading' : 'btn-interactive'}`}
              >
                {loading ? (
                  <>
                    <svg className="spinner-svg" fill="none" viewBox="0 0 24 24">
                      <circle className="spinner-circle" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="spinner-path" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Resolving video details...</span>
                  </>
                ) : (
                  <>
                    <Play className="btn-icon fill-current" />
                    <span>Get Download Links</span>
                  </>
                )}
              </button>
            )}
          </form>
        </div>

        {/* Video Preview & Download Area */}
        {videoData && (
          <div className="glass-card preview-card-container">
            
            {/* Left side: Premium HTML5 Video Player */}
            <div className="video-column">
              <div className="video-box">
                <video 
                  id="video-player"
                  src={videoData.videoUrl} 
                  controls 
                  preload="metadata"
                  poster={videoData.thumbnail}
                  className="video-element"
                />
              </div>
            </div>

            {/* Right side: Video details & options */}
            <div className="details-column">
              
              {/* Demo Mode Alert Banner */}
              {videoData.isDemo && (
                <div className="alert-banner warning">
                  <AlertCircle className="alert-icon" />
                  <div className="alert-content">
                    <span className="alert-title">Downstream Rate Limits: </span>
                    <span className="alert-message">{videoData.message}</span>
                  </div>
                </div>
              )}

              {/* Author & Profile details */}
              <div className="meta-section">
                <div className="profile-box">
                  <div className="avatar">
                    @{videoData.author.substring(0,2).toUpperCase()}
                  </div>
                  <div className="profile-info">
                    <p className="author-name">@{videoData.author}</p>
                    <p className="music-name">
                      <Music className="music-icon" />
                      {videoData.music}
                    </p>
                  </div>
                </div>

                {/* Video Description/Title */}
                <h3 className="video-title">
                  {videoData.title}
                </h3>

                {/* Video stats metrics */}
                <div className="stats-grid">
                  <div className="stat-card">
                    <Heart className="stat-icon heart" />
                    <span className="stat-val">{formatNumber(videoData.stats.likes)}</span>
                    <span className="stat-label">Likes</span>
                  </div>
                  <div className="stat-card">
                    <MessageCircle className="stat-icon comment" />
                    <span className="stat-val">{formatNumber(videoData.stats.comments)}</span>
                    <span className="stat-label">Comments</span>
                  </div>
                  <div className="stat-card">
                    <Share2 className="stat-icon share" />
                    <span className="stat-val">{formatNumber(videoData.stats.shares)}</span>
                    <span className="stat-label">Shares</span>
                  </div>
                  <div className="stat-card">
                    <Play className="stat-icon play" />
                    <span className="stat-val">{formatNumber(videoData.stats.plays)}</span>
                    <span className="stat-label">Plays</span>
                  </div>
                </div>
              </div>

              {/* Action buttons (Download & Share) */}
              <div className="download-section">
                {/* Hide standard button in Telegram to prefer the native bottom MainButton */}
                {!isTelegram && (
                  <button
                    id="download-mp4-btn"
                    onClick={triggerDownload}
                    disabled={downloading}
                    className={`download-btn ${
                      downloadSuccess 
                        ? 'download-success'
                        : downloading 
                          ? 'download-active'
                          : 'download-default'
                    }`}
                  >
                    {downloadSuccess ? (
                      <>
                        <Check className="btn-icon" />
                        <span>Download Started Successfully!</span>
                      </>
                    ) : downloading ? (
                      <>
                        <svg className="spinner-svg" fill="none" viewBox="0 0 24 24">
                          <circle className="spinner-circle" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="spinner-path" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span>Triggering high-speed stream...</span>
                      </>
                    ) : (
                      <>
                        <Download className="btn-icon" />
                        <span>Download MP4 (No Watermark)</span>
                      </>
                    )}
                  </button>
                )}

                <p className="download-disclaimer">
                  {isTelegram 
                    ? 'Tap the Telegram Main Button below to download this video.'
                    : 'Files are fetched directly via our server proxy to bypass CORS hotlinking restrictions.'}
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer Branding */}
      <footer className="footer">
        <p className="footer-copyright">
          © {new Date().getFullYear()} TokSave Pro. Developed under compliance guidelines.
        </p>
        <p className="footer-warning">
          For educational & archival use. We do not host or store any video files on our servers.
        </p>
      </footer>
    </div>
  )
}
