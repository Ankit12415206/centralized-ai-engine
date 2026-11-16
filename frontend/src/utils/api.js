import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

/**
 * Streams an AI response token by token using Server-Sent Events (SSE).
 * Validates response status (400, 403, 500) before streaming.
 */
export function streamMessage(
  {
    message,
    platformId = 'axiom-web',
    userId,
    memoryScope = 'global',
    language = 'en',
    sessionId = null,
    imageBase64 = null
  },
  onChunk,
  onDone,
  onError
) {
  const controller = new AbortController()

  fetch(`${BASE_URL}/api/interact/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: controller.signal,
    body: JSON.stringify({
      platform_id: platformId,
      user_id: userId,
      message,
      memory_scope: memoryScope,
      language,
      session_id: sessionId,
      image_base64: imageBase64,
    }),
  })
    .then(async (res) => {
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        const errorMsg = errJson.detail || `Server returned ${res.status}: ${res.statusText}`
        throw new Error(errorMsg)
      }

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

  return controller
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

export async function getUserContext(userId, platformId = 'axiom-web', sessionId = null) {
  const params = { platform_id: platformId }
  if (sessionId) params.session_id = sessionId
  const res = await api.get(`/api/context/${userId}`, { params })
  return res.data.context
}

export async function clearUserContext(userId, platformId = 'axiom-web', scope = 'all') {
  const res = await api.delete(`/api/context/${userId}`, {
    params: { platform_id: platformId, scope }
  })
  return res.data
}

export async function getSessions(userId, platformId = 'axiom-web') {
  const res = await api.get(`/api/sessions/${userId}`, {
    params: { platform_id: platformId }
  })
  return res.data.sessions
}

export async function getSessionHistory(userId, sessionId, platformId = 'axiom-web') {
  const res = await api.get(`/api/history/${userId}/${sessionId}`, {
    params: { platform_id: platformId }
  })
  return res.data.messages
}

export async function getPermissions(userId, requestingPlatformId = 'axiom-web') {
  const res = await api.get(`/api/permissions/${userId}`, {
    params: { requesting_platform_id: requestingPlatformId }
  })
  return res.data.permissions
}

export async function setPermission({ userId, ownerPlatformId, requesterPlatformId, status = 'granted', actingPlatformId = 'axiom-web' }) {
  const res = await api.post('/api/permissions', {
    user_id: userId,
    owner_platform_id: ownerPlatformId,
    requester_platform_id: requesterPlatformId,
    status,
    acting_platform_id: actingPlatformId
  })
  return res.data
}

export async function updatePermission({ userId, ownerPlatformId, requesterPlatformId, status, actingPlatformId = 'axiom-web' }) {
  const res = await api.put('/api/permissions', {
    user_id: userId,
    owner_platform_id: ownerPlatformId,
    requester_platform_id: requesterPlatformId,
    status,
    acting_platform_id: actingPlatformId
  })
  return res.data
}

export async function getPlatforms(userId, requestingPlatformId = 'axiom-web') {
  const res = await api.get(`/api/platforms/${userId}`, {
    params: { requesting_platform_id: requestingPlatformId }
  })
  return res.data.platforms
}

export async function getPreferences(userId, platformId = 'axiom-web') {
  const res = await api.get(`/api/preferences/${userId}`, {
    params: { platform_id: platformId }
  })
  return res.data.preferences
}

export default api
