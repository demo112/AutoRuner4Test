type EventHandler = (event: string, taskId: string, data: any) => void

class WsClient {
  private ws: WebSocket | null = null
  private handlers: EventHandler[] = []
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/ws`
    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      console.log('WebSocket connected')
    }

    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        for (const handler of this.handlers) {
          handler(msg.event, msg.taskId, msg.data)
        }
      } catch {
        // ignore
      }
    }

    this.ws.onclose = () => {
      this.reconnectTimer = setTimeout(() => this.connect(), 3000)
    }
  }

  onEvent(handler: EventHandler) {
    this.handlers.push(handler)
    return () => {
      this.handlers = this.handlers.filter(h => h !== handler)
    }
  }

  subscribe(taskId: string) {
    this.ws?.send(JSON.stringify({ type: 'subscribe', taskId }))
  }

  unsubscribe(taskId: string) {
    this.ws?.send(JSON.stringify({ type: 'unsubscribe', taskId }))
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
  }
}

export const wsClient = new WsClient()
