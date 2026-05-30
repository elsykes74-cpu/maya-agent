// Vercel Node.js serverless entry - bridges Node.js req/res to Hono's Web API fetch handler.
import app from '../dist/boot.js'

export default async function handler(req, res) {
  try {
    const protocol = req.headers['x-forwarded-proto'] || 'https'
    const host = req.headers['x-forwarded-host'] || req.headers.host
    const url = `${protocol}://${host}${req.url}`

    const bodyChunks = []
    for await (const chunk of req) {
      bodyChunks.push(chunk)
    }
    const body = Buffer.concat(bodyChunks)

    const request = new Request(url, {
      method: req.method,
      headers: Object.fromEntries(
        Object.entries(req.headers).filter(([, v]) => v != null)
      ),
      body: ['GET', 'HEAD'].includes(req.method ?? '') ? undefined : body.length > 0 ? body : undefined,
    })

    const response = await app.fetch(request)

    res.statusCode = response.status
    for (const [key, value] of response.headers.entries()) {
      res.setHeader(key, value)
    }
    const responseBody = await response.arrayBuffer()
    res.end(Buffer.from(responseBody))
  } catch (err) {
    console.error('[vercel handler]', err)
    res.statusCode = 500
    res.end('Internal Server Error')
  }
}
