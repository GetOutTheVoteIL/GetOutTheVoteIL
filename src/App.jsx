import { useEffect, useState } from 'react'
import './App.css'
import {
  ELECTION_STATES,
  PARTICIPATION_PROMPT,
  buildShareMessage,
  deriveElectionState,
  electionConfig,
  formatChicagoNow,
  getMapsQueryForState,
  getStateContent,
} from './lib/election'
import { getPickedContactName, isLikelyIl9Contact } from './lib/locality'
import { copyTextToClipboard, maskContact, normalizeContact } from './lib/relay'

const SHARE_MODES = {
  SMS: 'sms',
  EMAIL: 'email',
}

const STORAGE_KEYS = {
  sms: 'gotv-il-sms-contacts',
  email: 'gotv-il-email-contacts',
}

const CONTACT_SPLIT_PATTERN = /[\n,;]+/

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isMobileDevice() {
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent)
}

function openExternalUrl(url, preferSameWindow = false) {
  if (preferSameWindow) {
    window.location.href = url
    return
  }

  window.open(url, '_blank', 'noopener,noreferrer')
}

function splitContactInput(value) {
  return value
    .split(CONTACT_SPLIT_PATTERN)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function sortContactsByLocality(contactList) {
  return [...contactList].sort((left, right) => {
    const leftRank = left.locality === 'local' ? 0 : 1
    const rightRank = right.locality === 'local' ? 0 : 1

    return leftRank - rightRank
  })
}

function buildStoredContact(normalized, detail = {}) {
  return {
    kind: normalized.kind,
    locality: detail.locality || 'unknown',
    masked: maskContact(normalized.value, normalized.kind),
    name: detail.name || '',
    value: normalized.value,
  }
}

function loadStoredContacts(storageKey, expectedKind) {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const rawValue = window.localStorage.getItem(storageKey)

    if (!rawValue) {
      return []
    }

    const parsedValue = JSON.parse(rawValue)

    if (!Array.isArray(parsedValue)) {
      return []
    }

    const normalizedContacts = parsedValue
      .map((contact) => {
        const normalized = normalizeContact(String(contact?.value || ''))

        if (!normalized || normalized.kind !== expectedKind) {
          return null
        }

        return buildStoredContact(normalized, contact)
      })
      .filter(Boolean)

    return sortContactsByLocality(normalizedContacts)
  } catch {
    return []
  }
}

function persistContacts(storageKey, contacts) {
  if (typeof window === 'undefined') {
    return
  }

  const serializableContacts = contacts.map((contact) => ({
    kind: contact.kind,
    locality: contact.locality,
    name: contact.name,
    value: contact.value,
  }))

  window.localStorage.setItem(storageKey, JSON.stringify(serializableContacts))
}

function getModeKind(mode) {
  return mode === SHARE_MODES.SMS ? 'phone' : 'email'
}

function getModeButtonLabel(mode, iosDevice) {
  if (mode === SHARE_MODES.SMS) {
    return iosDevice ? 'Text / iMessage' : 'Text'
  }

  return 'Email'
}

function getModePlaceholder(mode) {
  if (mode === SHARE_MODES.SMS) {
    return 'Paste phone numbers\nOne per line, comma, or semicolon'
  }

  return 'Paste email addresses\nOne per line, comma, or semicolon'
}

function getModePickerLabel(mode) {
  return mode === SHARE_MODES.SMS ? 'Search phone' : 'Search email'
}

function getModeInputLabel(mode) {
  return mode === SHARE_MODES.SMS ? 'Add phone numbers' : 'Add email addresses'
}

function getModeEmptyState(mode) {
  return mode === SHARE_MODES.SMS
    ? 'No phone numbers yet. Add a few and go.'
    : 'No emails yet. Add a few and go.'
}

function getModeInvalidMessage(mode) {
  return mode === SHARE_MODES.SMS ? 'Use phone numbers only.' : 'Use email addresses only.'
}

function getModeOpenLabel(mode, iosDevice) {
  if (mode === SHARE_MODES.SMS) {
    return iosDevice ? 'Open Messages' : 'Open Text'
  }

  return 'Open Email'
}

function getAlternateMode(mode) {
  return mode === SHARE_MODES.SMS ? SHARE_MODES.EMAIL : SHARE_MODES.SMS
}

function getMapUrl(latitude, longitude, state) {
  const query = encodeURIComponent(getMapsQueryForState(state))
  const lat = latitude.toFixed(5)
  const lng = longitude.toFixed(5)

  if (isIosDevice()) {
    return `https://maps.apple.com/?ll=${lat},${lng}&q=${query}`
  }

  return `https://www.google.com/maps/search/${query}/@${lat},${lng},14z`
}

function App() {
  const mobileDevice = typeof navigator !== 'undefined' && isMobileDevice()
  const iosDevice = typeof navigator !== 'undefined' && isIosDevice()

  const [now, setNow] = useState(() => new Date())
  const [selectedJurisdiction, setSelectedJurisdiction] = useState('chicago')
  const [shareMode, setShareMode] = useState(() =>
    mobileDevice ? SHARE_MODES.SMS : SHARE_MODES.EMAIL,
  )
  const [smsContacts, setSmsContacts] = useState(() =>
    loadStoredContacts(STORAGE_KEYS.sms, 'phone'),
  )
  const [emailContacts, setEmailContacts] = useState(() =>
    loadStoredContacts(STORAGE_KEYS.email, 'email'),
  )
  const [contactInput, setContactInput] = useState('')
  const [inputFeedback, setInputFeedback] = useState('')
  const [shareFeedback, setShareFeedback] = useState('')
  const [locationFeedback, setLocationFeedback] = useState('')
  const [isLocating, setIsLocating] = useState(false)
  const [isPickingContacts, setIsPickingContacts] = useState(false)
  const [pickerSupportsAddress, setPickerSupportsAddress] = useState(false)
  const [alternatePrompt, setAlternatePrompt] = useState(null)

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(new Date())
    }, 30000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadContactPickerCapabilities() {
      if (
        typeof navigator === 'undefined' ||
        typeof navigator.contacts?.select !== 'function' ||
        typeof navigator.contacts.getProperties !== 'function'
      ) {
        return
      }

      try {
        const properties = await navigator.contacts.getProperties()

        if (!cancelled) {
          setPickerSupportsAddress(properties.includes('address'))
        }
      } catch {
        if (!cancelled) {
          setPickerSupportsAddress(false)
        }
      }
    }

    loadContactPickerCapabilities()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    persistContacts(STORAGE_KEYS.sms, smsContacts)
  }, [smsContacts])

  useEffect(() => {
    persistContacts(STORAGE_KEYS.email, emailContacts)
  }, [emailContacts])

  const electionState = deriveElectionState(now, electionConfig)
  const stateContent = getStateContent(electionState, electionConfig)
  const isActionable = electionState !== ELECTION_STATES.TOO_LATE
  const isInformationalOnly = electionState === ELECTION_STATES.TOO_LATE
  const chicagoNow = formatChicagoNow(now)
  const jurisdiction = electionConfig.jurisdictions[selectedJurisdiction]
  const canUseContactPicker =
    isActionable &&
    typeof navigator !== 'undefined' &&
    typeof navigator.contacts?.select === 'function'
  const activeContacts = shareMode === SHARE_MODES.SMS ? smsContacts : emailContacts
  const activeCount = activeContacts.length
  const canCompose = isActionable && activeCount > 0
  const baseShareUrl = `${window.location.origin}${window.location.pathname}`
  const sharePreview = buildShareMessage(electionState)

  useEffect(() => {
    if (!isInformationalOnly) {
      return
    }

    setContactInput('')
    setInputFeedback('')
    setShareFeedback('')
    setLocationFeedback('')
    setIsLocating(false)
    setIsPickingContacts(false)
    setAlternatePrompt(null)
  }, [isInformationalOnly])

  function setContactsForMode(mode, nextContacts) {
    const sortedContacts = sortContactsByLocality(nextContacts)

    if (mode === SHARE_MODES.SMS) {
      setSmsContacts(sortedContacts)
      return
    }

    setEmailContacts(sortedContacts)
  }

  function addContacts(rawEntries, mode = shareMode) {
    const expectedKind = getModeKind(mode)
    const currentContacts = mode === SHARE_MODES.SMS ? smsContacts : emailContacts
    const nextContacts = [...currentContacts]
    const knownValues = new Set(currentContacts.map((contact) => contact.value))
    const result = {
      added: 0,
      invalid: 0,
      addedContacts: [],
    }

    rawEntries.forEach((entry) => {
      const detail =
        typeof entry === 'string'
          ? { raw: entry, locality: 'unknown', name: '' }
          : entry

      const normalized = normalizeContact(detail.raw)

      if (!normalized || normalized.kind !== expectedKind) {
        result.invalid += 1
        return
      }

      if (knownValues.has(normalized.value)) {
        return
      }

      knownValues.add(normalized.value)
      const storedContact = buildStoredContact(normalized, detail)

      nextContacts.push(storedContact)
      result.addedContacts.push(storedContact)
      result.added += 1
    })

    if (result.added > 0) {
      setContactsForMode(mode, nextContacts)
      setShareFeedback('')
      setInputFeedback(`Added ${result.added}.`)
      return result
    }

    setInputFeedback(
      result.invalid > 0 ? getModeInvalidMessage(mode) : 'No new people added.',
    )
    return result
  }

  function handleManualAdd(event) {
    event.preventDefault()
    setAlternatePrompt(null)

    const rawEntries = splitContactInput(contactInput)

    if (rawEntries.length === 0) {
      setInputFeedback(
        shareMode === SHARE_MODES.SMS
          ? 'Paste or type phone numbers.'
          : 'Paste or type email addresses.',
      )
      return
    }

    const result = addContacts(rawEntries, shareMode)

    if (result.added > 0) {
      setContactInput('')
    }
  }

  async function handleContactPicker() {
    if (!canUseContactPicker) {
      return
    }

    setIsPickingContacts(true)
    setInputFeedback('')

    try {
      const properties = ['name', 'tel', 'email']

      if (pickerSupportsAddress) {
        properties.push('address')
      }

      const selectedContacts = await navigator.contacts.select(properties, {
        multiple: true,
      })

      const entries = []
      const alternateEntries = []
      const alternateMode = getAlternateMode(shareMode)

      selectedContacts.forEach((contact) => {
        const phoneCandidates = [...(contact.tel || [])].filter(Boolean)
        const emailCandidates = [...(contact.email || [])].filter(Boolean)
        const primaryCandidate =
          shareMode === SHARE_MODES.SMS ? phoneCandidates[0] : emailCandidates[0]
        const alternateCandidate =
          shareMode === SHARE_MODES.SMS ? emailCandidates[0] : phoneCandidates[0]

        const locality = isLikelyIl9Contact(contact) ? 'local' : 'unknown'
        const name = getPickedContactName(contact)

        if (primaryCandidate) {
          entries.push({
            raw: primaryCandidate,
            locality,
            name,
          })
          return
        }

        if (alternateCandidate) {
          alternateEntries.push({
            raw: alternateCandidate,
            locality,
            name,
          })
        }
      })

      const primaryResult =
        entries.length > 0
          ? addContacts(entries, shareMode)
          : { added: 0, invalid: 0, addedContacts: [] }
      const alternateResult =
        alternateEntries.length > 0
          ? addContacts(alternateEntries, alternateMode)
          : { added: 0, invalid: 0, addedContacts: [] }

      if (primaryResult.added === 0 && alternateResult.added === 0) {
        setAlternatePrompt(null)
        setInputFeedback('No usable phone numbers or emails came back from that pick.')
      } else {
        const feedbackParts = []

        if (primaryResult.added > 0) {
          feedbackParts.push(`Added ${primaryResult.added}.`)
        }

        if (alternateResult.added > 0) {
          feedbackParts.push(
            shareMode === SHARE_MODES.EMAIL
              ? `${alternateResult.added} had no email. Text them instead.`
              : `${alternateResult.added} had no phone number. Email them instead.`,
          )
        }

        setAlternatePrompt(
          alternateResult.added > 0
            ? {
                mode: alternateMode,
                contacts: alternateResult.addedContacts,
              }
            : null,
        )
        setInputFeedback(feedbackParts.join(' '))
      }
    } catch (error) {
      if (error?.name !== 'AbortError') {
        setInputFeedback('Contact picker did not finish. You can still paste people in.')
      }
    } finally {
      setIsPickingContacts(false)
    }
  }

  function handleRemoveContact(value) {
    setContactsForMode(
      shareMode,
      activeContacts.filter((contact) => contact.value !== value),
    )
  }

  function handleSelectMode(mode) {
    setShareMode(mode)
    setContactInput('')
    setInputFeedback('')
    setShareFeedback('')
    setAlternatePrompt(null)
  }

  function getShareArtifacts() {
    const publicText = `${buildShareMessage(electionState)}\n\n${baseShareUrl}`

    return {
      publicText,
    }
  }

  async function openSmsCompose(contactsToUse = smsContacts) {
    if (contactsToUse.length === 0) {
      setShareMode(SHARE_MODES.SMS)
      setShareFeedback('Add at least one phone number first.')
      return
    }

    const shareArtifacts = getShareArtifacts()
    const recipients = contactsToUse.map((contact) => contact.value).join(',')
    const separator = iosDevice ? '&' : '?'
    const smsUrl = `sms:${recipients}${separator}body=${encodeURIComponent(shareArtifacts.publicText)}`
    const textLabel = getModeButtonLabel(SHARE_MODES.SMS, iosDevice)

    let copied = false

    try {
      await copyTextToClipboard(shareArtifacts.publicText)
      copied = true
    } catch {
      copied = false
    }

    setShareFeedback(copied ? `${textLabel} opened. Message copied too.` : `${textLabel} opened.`)
    openExternalUrl(smsUrl, true)
  }

  function openEmailCompose(contactsToUse = emailContacts) {
    if (contactsToUse.length === 0) {
      setShareMode(SHARE_MODES.EMAIL)
      setShareFeedback('Add at least one email first.')
      return
    }

    const shareArtifacts = getShareArtifacts()
    const recipients = contactsToUse.map((contact) => contact.value).join(',')
    const emailUrl = `mailto:?bcc=${encodeURIComponent(recipients)}&subject=${encodeURIComponent('The IL-9 Vote Challenge')}&body=${encodeURIComponent(shareArtifacts.publicText)}`

    setShareFeedback('Email opened.')
    openExternalUrl(emailUrl, true)
  }

  function handlePrimaryShare() {
    setAlternatePrompt(null)

    if (shareMode === SHARE_MODES.SMS) {
      openSmsCompose()
      return
    }

    openEmailCompose()
  }

  function handleAlternateShare() {
    if (!alternatePrompt) {
      return
    }

    if (alternatePrompt.mode === SHARE_MODES.SMS) {
      openSmsCompose(alternatePrompt.contacts)
      return
    }

    openEmailCompose(alternatePrompt.contacts)
  }

  function handleLocate() {
    if (!isActionable) {
      return
    }

    if (!navigator.geolocation) {
      setLocationFeedback('Use the official links below if location is unavailable.')
      return
    }

    setIsLocating(true)
    setLocationFeedback('')

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false)
        const mapUrl = getMapUrl(
          position.coords.latitude,
          position.coords.longitude,
          electionState,
        )

        openExternalUrl(mapUrl)
      },
      () => {
        setIsLocating(false)
        setLocationFeedback('Location was blocked. Use the official links below.')
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000,
      },
    )
  }

  return (
    <div className="app-shell" data-state={electionState}>
      <div className="glow glow-a" aria-hidden="true" />
      <div className="glow glow-b" aria-hidden="true" />

      <main className="challenge-page">
        <section className="hero-panel surface">
          <div className="hero-copy">
            <p className="eyebrow">
              {isInformationalOnly ? 'IL-9 voter info' : 'The IL-9 Vote Challenge'}
            </p>
            <div className="headline-row">
              <span className="state-pill">{stateContent.badge}</span>
              <span className="time-pill">{chicagoNow}</span>
            </div>
            <h1>{isInformationalOnly ? 'IL-9 voter info' : 'The IL-9 Vote Challenge'}</h1>
            <p className="hero-headline">{stateContent.headline}</p>
            <p className="hero-lead">{stateContent.lead}</p>

            <div className="hero-actions">
              {isActionable ? (
                <>
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={handleLocate}
                    disabled={isLocating}
                  >
                    {isLocating ? 'Opening maps...' : stateContent.mapButtonLabel}
                  </button>
                  <a className="button button-secondary" href="#challenge">
                    Start fast
                  </a>
                </>
              ) : (
                <a className="button button-primary" href="#official">
                  Official links
                </a>
              )}
            </div>

            {locationFeedback && <p className="inline-note">{locationFeedback}</p>}
          </div>

          <div className="hero-badges">
            {stateContent.statusCards.map((card) => (
              <div className="hero-badge" key={card.label}>
                <span>{card.label}</span>
                <strong>{card.value}</strong>
              </div>
            ))}
            <div className="hero-badge accent-badge">
              <span>Fast mode</span>
              <strong>{isActionable ? 'Pick Email or Text. Add people. Open it.' : 'Official info only.'}</strong>
            </div>
          </div>
        </section>

        <section className="content-grid">
          {isActionable ? (
            <article className="surface challenge-card" id="challenge">
              <div className="section-head">
                <p className="panel-kicker">Quick send</p>
                <h2>Pick Email or Text. Add people. Open it.</h2>
                <p>{PARTICIPATION_PROMPT}</p>
                <p className="tiny-note">Text opens one group text. Email uses BCC.</p>
              </div>

              <div className="quick-steps">
                <span>1. Pick a lane</span>
                <span>2. Add people</span>
                <span>3. Open it</span>
              </div>

              <div className="share-panel">
                <div className="share-head">
                  <p className="panel-kicker">Share</p>
                  <span className={`count-pill ${canCompose ? 'is-ready' : ''}`}>
                    {activeCount > 0 ? `${activeCount} added` : 'Add people'}
                  </span>
                </div>

                <p className="share-preview">{sharePreview}</p>

                <div className="share-actions">
                  {mobileDevice ? (
                    <>
                      <button
                        className={`button ${shareMode === SHARE_MODES.SMS ? 'button-primary' : 'button-secondary'}`}
                        type="button"
                        onClick={() => handleSelectMode(SHARE_MODES.SMS)}
                      >
                        {getModeButtonLabel(SHARE_MODES.SMS, iosDevice)}
                      </button>
                      <button
                        className={`button ${shareMode === SHARE_MODES.EMAIL ? 'button-primary' : 'button-secondary'}`}
                        type="button"
                        onClick={() => handleSelectMode(SHARE_MODES.EMAIL)}
                      >
                        Email
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className={`button ${shareMode === SHARE_MODES.EMAIL ? 'button-primary' : 'button-secondary'}`}
                        type="button"
                        onClick={() => handleSelectMode(SHARE_MODES.EMAIL)}
                      >
                        Email
                      </button>
                      <button
                        className={`button ${shareMode === SHARE_MODES.SMS ? 'button-primary' : 'button-secondary'}`}
                        type="button"
                        onClick={() => handleSelectMode(SHARE_MODES.SMS)}
                      >
                        {getModeButtonLabel(SHARE_MODES.SMS, iosDevice)}
                      </button>
                    </>
                  )}
                </div>

                <div className="relay-panel">
                  <form className="contact-form" onSubmit={handleManualAdd}>
                    <label className="visually-hidden" htmlFor="contact-entry">
                      {getModeInputLabel(shareMode)}
                    </label>
                    <textarea
                      id="contact-entry"
                      className="paste-input"
                      rows="3"
                      autoComplete="off"
                      autoCapitalize="off"
                      autoCorrect="off"
                      value={contactInput}
                      onChange={(event) => setContactInput(event.target.value)}
                      placeholder={getModePlaceholder(shareMode)}
                    />
                    <button className="button button-secondary" type="submit">
                      {shareMode === SHARE_MODES.SMS ? 'Add numbers' : 'Add emails'}
                    </button>
                  </form>

                  <div className="picker-row">
                    {canUseContactPicker && (
                      <button
                        className="button button-ghost"
                        type="button"
                        onClick={handleContactPicker}
                        disabled={isPickingContacts}
                      >
                        {isPickingContacts ? 'Opening…' : getModePickerLabel(shareMode)}
                      </button>
                    )}
                  </div>

                  {inputFeedback && <p className="inline-note">{inputFeedback}</p>}

                  <ul className="contact-list">
                    {activeContacts.length === 0 ? (
                      <li className="empty-state">{getModeEmptyState(shareMode)}</li>
                    ) : (
                      activeContacts.map((contact) => (
                        <li className="contact-item" key={contact.value}>
                          <div className="contact-copy">
                            <div className="contact-line">
                              {contact.name && <strong>{contact.name}</strong>}
                              {contact.locality === 'local' && (
                                <span className="contact-flag">IL-9</span>
                              )}
                            </div>
                            <span>{contact.masked}</span>
                          </div>
                          <button
                            className="button button-inline"
                            type="button"
                            onClick={() => handleRemoveContact(contact.value)}
                          >
                            Remove
                          </button>
                        </li>
                      ))
                    )}
                  </ul>

                  <button
                    className="button button-primary"
                    type="button"
                    onClick={handlePrimaryShare}
                    disabled={!canCompose}
                  >
                    {getModeOpenLabel(shareMode, iosDevice)}
                  </button>

                  {alternatePrompt && (
                    <div className="alternate-prompt">
                      <p className="tiny-note">
                        {shareMode === SHARE_MODES.EMAIL
                          ? `${alternatePrompt.contacts.length} picked contact${alternatePrompt.contacts.length === 1 ? '' : 's'} had no email.`
                          : `${alternatePrompt.contacts.length} picked contact${alternatePrompt.contacts.length === 1 ? '' : 's'} had no phone number.`}{' '}
                        {alternatePrompt.mode === SHARE_MODES.SMS
                          ? 'Send them a group text instead.'
                          : 'Send them a BCC email instead.'}
                      </p>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={handleAlternateShare}
                      >
                        {alternatePrompt.mode === SHARE_MODES.SMS
                          ? iosDevice
                            ? 'Text them instead'
                            : 'Open text instead'
                          : 'Email them instead'}
                      </button>
                    </div>
                  )}
                </div>

                {shareFeedback && <p className="inline-note success-note">{shareFeedback}</p>}
              </div>
            </article>
          ) : (
            <article className="surface info-only-card">
              <div className="section-head">
                <p className="panel-kicker">Challenge closed</p>
                <h2>Voting is over.</h2>
                <p>Use the official links below for what is next.</p>
              </div>
            </article>
          )}

          <article className="surface official-card" id="official">
            <div className="section-head">
              <p className="panel-kicker">Official links</p>
              <h2>Pick your area.</h2>
              <p>{stateContent.guidance}</p>
            </div>

            <div className="jurisdiction-tabs" role="tablist" aria-label="Choose your voting area">
              {Object.entries(electionConfig.jurisdictions).map(([key, area]) => (
                <button
                  key={key}
                  className={`tab-button ${selectedJurisdiction === key ? 'is-active' : ''}`}
                  type="button"
                  onClick={() => setSelectedJurisdiction(key)}
                  aria-pressed={selectedJurisdiction === key}
                >
                  {area.label}
                </button>
              ))}
            </div>

            <div className="link-stack">
              {jurisdiction.links.map((link) => (
                <a
                  className="link-card"
                  href={link.href}
                  key={link.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  <strong>{link.label}</strong>
                  <span>{jurisdiction.region}</span>
                </a>
              ))}
            </div>

            <div className="statewide-row">
              {electionConfig.statewideLinks.map((link) => (
                <a
                  className="statewide-link"
                  href={link.href}
                  key={link.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </article>
        </section>
      </main>
    </div>
  )
}

export default App
