export const TOKEN_BYTES = 8
export const TOKEN_LENGTH = 11
export const MAX_SHARE_URL_LENGTH = 1800

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i
const contactEncoder = new TextEncoder()

export function normalizeContact(rawValue) {
  const value = rawValue.trim()

  if (!value) {
    return null
  }

  if (value.includes('@')) {
    const normalizedEmail = value.toLowerCase()

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      return null
    }

    return {
      kind: 'email',
      value: normalizedEmail,
    }
  }

  const digits = value.replace(/\D/g, '')

  if (digits.length === 10) {
    return {
      kind: 'phone',
      value: `+1${digits}`,
    }
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return {
      kind: 'phone',
      value: `+${digits}`,
    }
  }

  if (value.startsWith('+') && digits.length >= 11) {
    return {
      kind: 'phone',
      value: `+${digits}`,
    }
  }

  return null
}

export function maskContact(value, kind) {
  if (kind === 'email') {
    const [local, domain] = value.split('@')
    const visibleLocal = local.slice(0, Math.min(2, local.length))
    const hiddenLocal = '*'.repeat(Math.max(local.length - visibleLocal.length, 2))

    return `${visibleLocal}${hiddenLocal}@${domain}`
  }

  const digits = value.replace(/\D/g, '')
  const lastFour = digits.slice(-4)
  const countryCode = digits.length > 10 ? `+${digits.slice(0, digits.length - 10)} ` : ''

  return `${countryCode}***-***-${lastFour}`
}

function bytesToBase64Url(bytes) {
  let binary = ''

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function base64UrlToBytes(value) {
  if (!value) {
    return new Uint8Array()
  }

  const paddedValue = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=')

  const binary = atob(paddedValue)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

export async function contactToToken(canonicalContact) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Secure hashing is unavailable in this browser context.')
  }

  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    contactEncoder.encode(canonicalContact),
  )

  return bytesToBase64Url(new Uint8Array(digest).slice(0, TOKEN_BYTES))
}

function tokenToBytes(token) {
  const bytes = base64UrlToBytes(token)

  if (bytes.length !== TOKEN_BYTES) {
    return null
  }

  return bytes
}

function getPackedChainLength(tokenCount) {
  if (tokenCount <= 0) {
    return 0
  }

  return Math.ceil((tokenCount * TOKEN_BYTES * 4) / 3)
}

function packTokenChain(tokens = []) {
  if (tokens.length === 0) {
    return ''
  }

  const byteGroups = tokens
    .map((token) => tokenToBytes(token))
    .filter((bytes) => bytes && bytes.length === TOKEN_BYTES)

  if (byteGroups.length === 0) {
    return ''
  }

  const combined = new Uint8Array(byteGroups.length * TOKEN_BYTES)

  byteGroups.forEach((bytes, index) => {
    combined.set(bytes, index * TOKEN_BYTES)
  })

  return bytesToBase64Url(combined)
}

export function decodeTokenChain(rawValue = '') {
  if (!rawValue) {
    return []
  }

  const cleanValue = rawValue.trim()
  const bytes = base64UrlToBytes(cleanValue)
  const tokens = []
  const usableLength = bytes.length - (bytes.length % TOKEN_BYTES)

  for (let index = 0; index < usableLength; index += TOKEN_BYTES) {
    tokens.push(bytesToBase64Url(bytes.slice(index, index + TOKEN_BYTES)))
  }

  return tokens
}

export function decodeLegacyTokenChain(rawValue = '') {
  if (!rawValue) {
    return []
  }

  const cleanValue = rawValue.trim()
  const tokens = []

  for (let index = 0; index + TOKEN_LENGTH <= cleanValue.length; index += TOKEN_LENGTH) {
    tokens.push(cleanValue.slice(index, index + TOKEN_LENGTH))
  }

  return tokens
}

export function getRelayCapacity(baseUrl) {
  const availableCharacters = MAX_SHARE_URL_LENGTH - `${baseUrl}#`.length

  if (availableCharacters <= 0) {
    return 0
  }

  let capacity = Math.floor((availableCharacters * 3) / (4 * TOKEN_BYTES))

  while (capacity > 0 && getPackedChainLength(capacity) > availableCharacters) {
    capacity -= 1
  }

  return capacity
}

export function buildRelayUrl(baseUrl, priorTokens = [], nextTokens = []) {
  const seen = new Set()
  const combinedTokens = []

  ;[...priorTokens, ...nextTokens].forEach((token) => {
    if (token && !seen.has(token)) {
      seen.add(token)
      combinedTokens.push(token)
    }
  })

  const capacity = getRelayCapacity(baseUrl)
  const trimmedTokens = capacity > 0 ? combinedTokens.slice(-capacity) : []
  const packedTokens = packTokenChain(trimmedTokens)
  const shareUrl = packedTokens ? `${baseUrl}#${packedTokens}` : baseUrl

  return {
    capacity,
    shareUrl,
    tokens: trimmedTokens,
  }
}

export async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'absolute'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()

  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)

  if (!copied) {
    throw new Error('Unable to copy the share text.')
  }
}
