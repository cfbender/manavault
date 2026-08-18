import http from 'node:http'
import https from 'node:https'

const listenPort = Number(process.env.AMP_PORTAL_PROXY_PORT)
const targetOrigin = process.env.AMP_PORTAL_PROXY_TARGET_ORIGIN
if (!Number.isInteger(listenPort) || !targetOrigin) {
	throw new Error('AMP_PORTAL_PROXY_PORT and AMP_PORTAL_PROXY_TARGET_ORIGIN are required')
}
const target = new URL(targetOrigin)
if (target.protocol !== 'http:' && target.protocol !== 'https:') {
	throw new Error('AMP_PORTAL_PROXY_TARGET_ORIGIN must use HTTP or HTTPS')
}
const targetTransport = target.protocol === 'https:' ? https : http
const targetAgent =
	target.protocol === 'https:' ? new https.Agent({ rejectUnauthorized: false }) : undefined

function publicOrigin(req) {
	const rawOrigin = req.headers['x-amp-portal-origin']
	const origin = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin
	if (!origin) return null
	try {
		const url = new URL(origin)
		return url.protocol === 'https:' ? url.origin : null
	} catch {
		return null
	}
}

function upstreamHeaders(req, upgrade = false) {
	const headers = { ...req.headers }
	for (const key of Object.keys(headers)) {
		if (key.startsWith('e2b-')) delete headers[key]
	}
	for (const key of [
		'connection',
		'forwarded',
		'host',
		'keep-alive',
		'proxy-authorization',
		'te',
		'trailer',
		'transfer-encoding',
		'upgrade',
		'x-amp-portal-origin',
		'x-amp-portal-proxy-target-port',
		'x-forwarded-for',
		'x-forwarded-host',
		'x-forwarded-port',
		'x-forwarded-proto',
		'x-real-ip',
	]) {
		delete headers[key]
	}
	const origin = publicOrigin(req)
	if (origin) {
		const publicURL = new URL(origin)
		headers.host = publicURL.host
		headers['x-forwarded-host'] = publicURL.host
		headers['x-forwarded-port'] = publicURL.port || '443'
		headers['x-forwarded-proto'] = 'https'
	} else {
		headers.host = target.host
	}
	if (upgrade) {
		headers.connection = 'Upgrade'
		headers.upgrade = 'websocket'
	}
	return headers
}

function rewriteLocation(location, req) {
	const origin = publicOrigin(req)
	if (!origin || !location) return location
	return location
		.replace(new RegExp(`^https://${target.host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=/|$)`), origin)
		.replace(new RegExp(`^http://${target.host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=/|$)`), origin)
}

const server = http.createServer((req, res) => {
	if (req.method === 'GET' && req.url === '/.well-known/amp-portal-proxy-health') {
		res.writeHead(200, { 'content-type': 'application/json' })
		res.end(JSON.stringify({ targetOrigin, version: 2 }))
		return
	}

	const upstreamURL = new URL(req.url || '/', target)
	const upstream = targetTransport.request(
		upstreamURL,
		{ method: req.method, headers: upstreamHeaders(req), agent: targetAgent },
		(upstreamRes) => {
			res.statusCode = upstreamRes.statusCode || 502
			res.statusMessage = upstreamRes.statusMessage || ''
			for (const [key, value] of Object.entries(upstreamRes.headers)) {
				if (value === undefined) continue
				if (key.toLowerCase() === 'location') {
					res.setHeader(key, rewriteLocation(Array.isArray(value) ? value[0] : value, req))
				} else {
					res.setHeader(key, value)
				}
			}
			upstreamRes.pipe(res)
		},
	)
	upstream.on('error', (error) => {
		// AGENTS(amp-portal-proxy-upstream-unreachable): this header is a contract with the
		// ampcode.com portal proxy, which replaces this response with a friendly error page.
		res.writeHead(502, {
			'content-type': 'text/plain',
			'x-amp-portal-proxy-error': 'upstream-unreachable',
		})
		res.end(`portal proxy upstream error: ${error instanceof Error ? error.message : String(error)}\n`)
	})
	req.pipe(upstream)
})

// Bridge WebSocket upgrades (Vite HMR, /actors) to the target by piping raw sockets after
// forwarding the upgrade handshake.
server.on('upgrade', (req, socket, head) => {
	const upstreamURL = new URL(req.url || '/', target)
	const upstream = targetTransport.request(upstreamURL, {
		method: req.method,
		headers: upstreamHeaders(req, true),
		agent: targetAgent,
	})
	upstream.on('upgrade', (upstreamRes, upstreamSocket, upstreamHead) => {
		const lines = [
			`HTTP/1.1 ${upstreamRes.statusCode || 101} ${upstreamRes.statusMessage || 'Switching Protocols'}`,
		]
		for (let i = 0; i < upstreamRes.rawHeaders.length; i += 2) {
			lines.push(`${upstreamRes.rawHeaders[i]}: ${upstreamRes.rawHeaders[i + 1]}`)
		}
		socket.write(`${lines.join('\r\n')}\r\n\r\n`)
		if (upstreamHead.length > 0) socket.write(upstreamHead)
		if (head.length > 0) upstreamSocket.write(head)
		upstreamSocket.pipe(socket)
		socket.pipe(upstreamSocket)
		upstreamSocket.on('error', () => socket.destroy())
		socket.on('error', () => upstreamSocket.destroy())
		upstreamSocket.on('close', () => socket.destroy())
		socket.on('close', () => upstreamSocket.destroy())
	})
	upstream.on('response', (upstreamRes) => {
		// The upstream refused the upgrade; report its status and close.
		socket.end(`HTTP/1.1 ${upstreamRes.statusCode || 502} ${upstreamRes.statusMessage || ''}\r\nConnection: close\r\n\r\n`)
		upstreamRes.destroy()
	})
	upstream.on('error', () => socket.destroy())
	socket.on('close', () => upstream.destroy())
	upstream.end()
})

server.listen(listenPort, '0.0.0.0')
