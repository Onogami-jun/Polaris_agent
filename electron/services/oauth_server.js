/**
 * Polaris OAuth Loopback Server — RFC 8252
 *
 * Starts a temporary HTTP server on localhost:9876 to receive
 * the GitHub OAuth authorization code callback.
 *
 * Flow:
 *   1. Start server on localhost:9876
 *   2. Open browser to GitHub OAuth authorize URL with redirect to localhost
 *   3. User authorizes in browser
 *   4. GitHub redirects to http://localhost:9876/callback?code=xxx
 *   5. Server receives code, resolves the promise
 *   6. Caller exchanges code for access_token
 *   7. Server shuts down
 */

const http = require('http');

// Start a temporary server, return Promise<code>
function startLoopbackServer(port) {
  return new Promise((resolve, reject) => {
    const p = port || 9876;
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', 'http://localhost');
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>Authorization Failed</h2><p>' + error + '</p><p>You may close this window.</p></body></html>');
        server.close();
        reject(new Error(error));
        return;
      }

      if (code) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#0d0d12;color:#e8e4dd"><h2 style="color:#c8a96e">Authorization Complete</h2><p>Polaris has received your GitHub credentials.</p><p style="color:#8a8794;font-size:14px">You may close this window and return to the app.</p></body></html>');
        server.close();
        resolve(code);
        return;
      }

      // Unknown request — show a simple page
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#0d0d12;color:#e8e4dd"><h2>Polaris OAuth Server</h2><p style="color:#8a8794">Waiting for GitHub authorization...</p></body></html>');
    });

    server.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        // Port in use — try next port
        resolve(startLoopbackServer(p + 1));
      } else {
        reject(e);
      }
    });

    server.listen(p, '127.0.0.1', () => {
      resolve({ server, port: p });
    });
  });
}

module.exports = { startLoopbackServer };
