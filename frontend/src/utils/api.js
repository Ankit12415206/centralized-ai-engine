import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

/**
 * Stream a message response — calls onChunk for each token,
 * onDone when finished. Returns an AbortController so caller can stop it.
 */
export function streamMessage({ message, platformId, userId, language = 'en', sessionId = null, imageBase64 = null }, onChunk, onDone, onError) {
  const controller = new AbortController()

  fetch(`${BASE_URL}/api/interact/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: controller.signal,
    body: JSON.stringify({
      platform_id: platformId,
      user_id: userId,
      message,
      language,
      session_id: sessionId,
      image_base64: imageBase64,
    }),
  })
    .then(async (res) => {
      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value)
        const lines = text.split('\n').filter(l => l.startsWith('data: '))

        for (const line of lines) {
          try {
            const json = JSON.parse(line.replace('data: ', ''))
            if (json.done) {
              onDone(json.session_id)
            } else if (json.chunk) {
              onChunk(json.chunk, json.session_id)
            }
          } catch {}
        }
      }
    })
    .catch((err) => {
      if (err.name !== 'AbortError') onError(err)
    })

  return controller  // caller calls controller.abort() to stop
}

export async function transcribeAudio(audioBlob) {
  const form = new FormData()
  form.append('audio', audioBlob, 'recording.wav')
  const res = await api.post('/api/voice/transcribe', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data.transcribed_text
}

export async function synthesizeSpeech(text, language = 'en') {
  const res = await api.post('/api/voice/synthesize', null, { params: { text, language } })
  return `data:audio/mp3;base64,${res.data.audio_base64}`
}

export async function getUserContext(userId) {
  const res = await api.get(`/api/context/${userId}`)
  return res.data.context
}

export async function clearUserContext(userId) {
  const res = await api.delete(`/api/context/${userId}`)
  return res.data
}

export async function getSessions(userId) {
  const res = await api.get(`/api/sessions/${userId}`)
  return res.data.sessions
}

export async function getSessionHistory(userId, sessionId) {
  const res = await api.get(`/api/history/${userId}/${sessionId}`)
  return res.data.messages
}

export default api