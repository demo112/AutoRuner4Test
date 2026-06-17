interface Client {
  ws: any
  subscriptions: Set<string>  // subscribed task IDs, '*' = all
}

const clients = new Map<string, Client>()

export function addClient(id: string, ws: any): void {
  const client: Client = { ws, subscriptions: new Set(['*']) }
  clients.set(id, client)

  // Store subscriptions on the ws object for access in message handler
  ;(ws as any).__clientId = id
  ;(ws as any).__subscriptions = client.subscriptions
}

export function removeClient(id: string): void {
  clients.delete(id)
}

export function handleSubscription(ws: any, data: string): void {
  try {
    const msg = JSON.parse(data)
    const subs: Set<string> = (ws as any).__subscriptions
    if (!subs) return
    if (msg.type === 'subscribe' && msg.taskId) {
      subs.add(msg.taskId)
    }
    if (msg.type === 'unsubscribe' && msg.taskId) {
      subs.delete(msg.taskId)
    }
  } catch {
    // ignore malformed messages
  }
}

function shouldNotify(ws: any, taskId: string): boolean {
  const subs: Set<string> = (ws as any).__subscriptions
  return subs?.has('*') || subs?.has(taskId) || false
}

export function broadcast(event: string, taskId: string, data: any): void {
  const message = JSON.stringify({ event, taskId, data, timestamp: new Date().toISOString() })
  for (const client of clients.values()) {
    if (shouldNotify(client.ws, taskId) && client.ws.readyState === 1) {
      client.ws.send(message)
    }
  }
}

export function getClientCount(): number {
  return clients.size
}

// --- Gate-based session broadcast helpers (V2) ---

export function broadcastGateReached(sessionId: string, gateId: string, gateName: string, output: unknown): void {
  broadcast('session:gate-reached', sessionId, { sessionId, gateId, gateName, output })
}

export function broadcastSessionCompleted(sessionId: string, output: unknown): void {
  broadcast('session:completed', sessionId, { sessionId, output })
}

export function broadcastSessionFailed(sessionId: string, error: string): void {
  broadcast('session:failed', sessionId, { sessionId, error })
}

export function broadcastSessionProgress(sessionId: string, segmentIndex: number, totalSegments: number): void {
  broadcast('session:progress', sessionId, { sessionId, segmentIndex, totalSegments })
}
