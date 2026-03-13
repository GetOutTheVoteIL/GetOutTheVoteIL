const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i

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
