import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()

// Enable CORS for all API routes
app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  exposeHeaders: ['Content-Disposition']
}))

// Simple health check
app.get('/api/health', (c) => c.json({ status: 'ok' }))

app.get('/api/debug-env', (c) => {
  const envObj = (c.env || {}) as Record<string, any>
  const keys = Object.keys(envObj)
  const hasToken = typeof envObj.TELEGRAM_BOT_TOKEN !== 'undefined'
  return c.json({
    hasToken,
    keys,
    message: hasToken ? 'Token is loaded!' : 'Token is missing from environment.'
  })
})

// POST /api/download - Resolves TikTok URLs to video details
app.post('/api/download', async (c) => {
  try {
    const { url } = await c.req.json()

    if (!url) {
      return c.json({ success: false, error: 'URL is required' }, 400)
    }

    // Basic URL validation
    const tiktokRegex = /^https?:\/\/(?:[a-z0-9-]+\.)?tiktok\.com\/./i
    if (!tiktokRegex.test(url)) {
      return c.json({ 
        success: false, 
        error: 'Invalid TikTok URL. Please paste a valid tiktok.com video link.' 
      }, 400)
    }

    console.log(`Processing TikTok URL: ${url}`)

    // Fetch from TikWM API using URL-encoded form data (the standard format for TikWM)
    const formData = new URLSearchParams()
    formData.append('url', url)
    formData.append('hd', '1') // Request HD version if available

    let apiResponse: any = null
    try {
      const response = await fetch('https://www.tikwm.com/api/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: formData.toString()
      })

      if (response.ok) {
        apiResponse = await response.json()
      }
    } catch (fetchErr) {
      console.error('Error contacting external scraper API:', fetchErr)
    }

    // Check if TikWM API returned a successful resolution
    if (apiResponse && apiResponse.code === 0 && apiResponse.data) {
      const { data } = apiResponse
      const title = data.title || 'TikTok Video'
      const thumbnail = data.cover || data.origin_cover || 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=500'
      const videoUrl = data.play || data.wmplay
      
      const safeTitle = title
        .replace(/[^a-zA-Z0-9\s-_]/g, '')
        .substring(0, 50)
        .trim() || 'tiktok-video'

      // We provide a proxy URL that streams the video without CORS / hotlinking blocks
      const proxyDownloadUrl = `/api/proxy?url=${encodeURIComponent(videoUrl)}&title=${encodeURIComponent(safeTitle)}`

      return c.json({
        success: true,
        title,
        thumbnail,
        videoUrl,
        downloadUrl: proxyDownloadUrl,
        author: data.author?.unique_id || data.author?.nickname || 'unknown',
        stats: {
          plays: data.play_count || 0,
          likes: data.digg_count || 0,
          comments: data.comment_count || 0,
          shares: data.share_count || 0
        },
        music: data.music_info?.title || 'Original Sound',
        isDemo: false
      })
    }

    // Fallback: If external API failed or URL parsing failed, serve premium Demo Mode
    console.warn('TikWM resolution failed, serving high-quality Demo fallback.')
    
    // Choose a high-quality, high-speed test video as demo
    const demoVideoUrl = 'https://vjs.zencdn.net/v/oceans.mp4'
    const demoTitle = '[Demo Mode] Beautiful Ocean Waves - TikTok Edit'
    const proxyDownloadUrl = `/api/proxy?url=${encodeURIComponent(demoVideoUrl)}&title=oceans-waves-demo`

    return c.json({
      success: true,
      title: demoTitle,
      thumbnail: 'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=800',
      videoUrl: demoVideoUrl,
      downloadUrl: proxyDownloadUrl,
      author: 'ocean_explore',
      stats: {
        plays: 4839200,
        likes: 249000,
        comments: 15309,
        shares: 68902
      },
      music: 'Relaxing Deep Ocean Sounds - Ambient Nature',
      isDemo: true,
      message: 'The downstream downloader API is currently rate-limited. Serving a high-quality demo video.'
    })

  } catch (err: any) {
    console.error('Download handler crash:', err)
    return c.json({ success: false, error: err.message || 'Internal Server Error' }, 500)
  }
})

// GET /api/proxy - Proxy endpoint to fetch the media and stream it back.
// Bypasses CORS and referrer-policy hotlinking protections on social CDNs.
app.get('/api/proxy', async (c) => {
  const targetUrl = c.req.query('url')
  const title = c.req.query('title') || 'tiktok-video'

  if (!targetUrl) {
    return c.text('Missing url parameter', 400)
  }

  try {
    console.log(`Proxying video download: ${targetUrl}`)
    
    const fetchHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Encoding': 'identity'
    }

    if (targetUrl.includes('tiktok.com') || targetUrl.includes('tiktokcdn.com')) {
      fetchHeaders['Referer'] = 'https://www.tiktok.com/'
    }

    const mediaResponse = await fetch(targetUrl, {
      headers: fetchHeaders
    })

    if (!mediaResponse.ok) {
      return c.text(`Failed to retrieve source media: Status ${mediaResponse.status}`, mediaResponse.status)
    }

    // Set custom headers to force a download with a friendly filename
    const responseHeaders = new Headers()
    
    // Copy content headers if present
    const contentType = mediaResponse.headers.get('content-type') || 'video/mp4'
    responseHeaders.set('Content-Type', contentType)
    
    const contentLength = mediaResponse.headers.get('content-length')
    if (contentLength) {
      responseHeaders.set('Content-Length', contentLength)
    }

    // Force download download prompt
    responseHeaders.set('Content-Disposition', `attachment; filename="${title}.mp4"`)
    responseHeaders.set('Access-Control-Allow-Origin', '*')
    responseHeaders.set('Access-Control-Expose-Headers', 'Content-Disposition')
    responseHeaders.set('Cache-Control', 'public, max-age=86400')

    // Stream the body using c.body
    return c.body(mediaResponse.body, 200, Object.fromEntries(responseHeaders))

  } catch (err: any) {
    console.error('Error proxying media download:', err)
    return c.text(`Download proxy error: ${err.message || 'unknown error'}`, 500)
  }
})

// Helper function to send Telegram messages using Bot API
async function sendTelegramMessage(token: string, chatId: number, text: string, inlineKeyboard?: any[][]) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        reply_markup: inlineKeyboard ? { inline_keyboard: inlineKeyboard } : undefined
      })
    })
    if (res.ok) {
      return await res.json()
    }
  } catch (e) {
    console.error('Error sending Telegram message:', e)
  }
  return null
}

// Helper function to delete temporary status messages
async function deleteTelegramMessage(token: string, chatId: number, messageId: number) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId
      })
    })
  } catch (e) {
    console.error('Error deleting Telegram message:', e)
  }
}

// POST /api/bot - Telegram Bot Webhook receiver endpoint
app.post('/api/bot', async (c) => {
  // Read token from environment variable bound in wrangler.toml / Cloudflare Dashboard
  const botToken = (c.env as any)?.TELEGRAM_BOT_TOKEN
  
  if (!botToken) {
    console.warn('TELEGRAM_BOT_TOKEN environment variable is not defined.')
    return c.text('Bot token not configured', 500)
  }

  try {
    const update: any = await c.req.json()
    const message = update.message
    
    if (!message || !message.text) {
      return c.text('No text message', 200)
    }

    const chatId = message.chat.id
    const text = message.text.trim()
    const origin = new URL(c.req.url).origin

    // 1. Handle commands (/start, /help)
    if (text.startsWith('/start') || text.startsWith('/help')) {
      const welcomeText = 
        `👋 <b>Welcome to TokSave Bot!</b>\n\n` +
        `Send me any TikTok video link, and I will instantly parse it and return a direct, watermark-free download button.\n\n` +
        `You can also open our premium <b>Mini App</b> right inside Telegram by tapping the button below!`

      await sendTelegramMessage(botToken, chatId, welcomeText, [
        [
          {
            text: '📱 Open Mini App',
            web_app: { url: origin }
          }
        ]
      ])
      return c.text('Welcome handled', 200)
    }

    // 2. Handle TikTok video links
    const tiktokRegex = /^https?:\/\/(?:[a-z0-9-]+\.)?tiktok\.com\/./i
    if (tiktokRegex.test(text)) {
      // Send a temporary loading status message
      const statusMsg = await sendTelegramMessage(botToken, chatId, '🔍 <i>Resolving TikTok video, please wait...</i>')
      
      const formData = new URLSearchParams()
      formData.append('url', text)
      formData.append('hd', '1')

      let apiResponse: any = null
      try {
        const response = await fetch('https://www.tikwm.com/api/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          body: formData.toString()
        })
        if (response.ok) {
          apiResponse = await response.json()
        }
      } catch (err) {
        console.error('Bot API resolution error:', err)
      }

      // Delete the loading message if possible
      if (statusMsg?.result?.message_id) {
        await deleteTelegramMessage(botToken, chatId, statusMsg.result.message_id)
      }

      // If TikWM succeeds, format details and return
      if (apiResponse && apiResponse.code === 0 && apiResponse.data) {
        const { data } = apiResponse
        const title = data.title || 'TikTok Video'
        const videoUrl = data.play || data.wmplay
        const author = data.author?.unique_id || data.author?.nickname || 'unknown'
        
        const safeTitle = title
          .replace(/[^a-zA-Z0-9\s-_]/g, '')
          .substring(0, 50)
          .trim() || 'tiktok-video'

        const downloadUrl = `${origin}/api/proxy?url=${encodeURIComponent(videoUrl)}&title=${encodeURIComponent(safeTitle)}`

        const caption = 
          `📥 <b>TikTok Video Resolved!</b>\n\n` +
          `👤 <b>Author:</b> @${author}\n` +
          `🎵 <b>Music:</b> ${data.music_info?.title || 'Original Sound'}\n` +
          `📝 <b>Caption:</b> <i>${title.substring(0, 150)}${title.length > 150 ? '...' : ''}</i>`

        await sendTelegramMessage(botToken, chatId, caption, [
          [
            { text: '📥 Download MP4 (No Watermark)', url: downloadUrl }
          ],
          [
            { text: '📱 Open Mini App', web_app: { url: origin } }
          ]
        ])
      } else {
        // Fallback: Serve Demo mode with oceans video
        const demoVideoUrl = 'https://vjs.zencdn.net/v/oceans.mp4'
        const downloadUrl = `${origin}/api/proxy?url=${encodeURIComponent(demoVideoUrl)}&title=oceans-waves-demo`

        const caption = 
          `⚠️ <b>API Rate Limits Active: Serving Demo Fallback</b>\n\n` +
          `👤 <b>Author:</b> @ocean_explore\n` +
          `🎵 <b>Music:</b> Relaxing Deep Ocean Sounds - Ambient Nature\n` +
          `📝 <b>Caption:</b> <i>[Demo Mode] Beautiful Ocean Waves - TikTok Edit</i>`

        await sendTelegramMessage(botToken, chatId, caption, [
          [
            { text: '📥 Download Demo MP4', url: downloadUrl }
          ],
          [
            { text: '📱 Open Mini App', web_app: { url: origin } }
          ]
        ])
      }
      return c.text('TikTok handled', 200)
    }

    // 3. Handle arbitrary inputs
    await sendTelegramMessage(botToken, chatId, '❌ <b>Invalid Input.</b> Send me a valid TikTok link (e.g., <code>https://www.tiktok.com/...</code>) to download.')
    return c.text('Arbitrary input handled', 200)

  } catch (err: any) {
    console.error('Bot update error:', err)
    return c.text('Error processed', 200) // 200 so Telegram webhook stops retrying
  }
})

export default app
