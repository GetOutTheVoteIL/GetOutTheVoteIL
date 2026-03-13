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
import {
  copyTextToClipboard,
  maskContact,
  normalizeContact,
} from './lib/relay'

const MIN_CONTACT_TARGET = 3
const CONTACT_SPLIT_PATTERN = /[\n,;]+/
const RELAY_METHODS = {
  SMS: 'sms',
  WHATSAPP: 'whatsapp',
}

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

function getContactMessage(result) {
  if (result.added === 0 && result.invalid > 0) {
    return 'Use phone numbers only.'
  }

  if (result.added > 0) {
    return `Added ${result.added}.`
  }

  return 'No new contacts added.'
}

function sortContactsByLocality(contactList) {
  return [...contactList].sort((left, right) => {
    const leftRank = left.locality === 'local' ? 0 : 1
    const rightRank = right.locality === 'local' ? 0 : 1

    return leftRank - rightRank
  })
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
  const [now, setNow] = useState(() => new Date())
  const [selectedJurisdiction, setSelectedJurisdiction] = useState('chicago')
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState('')
  const [contacts, setContacts] = useState([])
  const [contactInput, setContactInput] = useState('')
  const [inputFeedback, setInputFeedback] = useState('')
  const [shareFeedback, setShareFeedback] = useState('')
  const [activeRelayMethod, setActiveRelayMethod] = useState(null)
  const [locationFeedback, setLocationFeedback] = useState('')
  const [isLocating, setIsLocating] = useState(false)
  const [isPickingContacts, setIsPickingContacts] = useState(false)
  const [pickerSupportsAddress, setPickerSupportsAddress] = useState(false)

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
    if (!photoFile) {
      setPhotoPreviewUrl('')
      return undefined
    }

    const previewUrl = URL.createObjectURL(photoFile)
    setPhotoPreviewUrl(previewUrl)

    return () => {
      URL.revokeObjectURL(previewUrl)
    }
  }, [photoFile])

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
  const canUseNativeShare =
    isActionable &&
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function'
  const mobileDevice = typeof navigator !== 'undefined' && isMobileDevice()
  const relayMode = activeRelayMethod !== null
  const relayReady = contacts.length >= MIN_CONTACT_TARGET
  const shareUnlocked = isActionable && (!relayMode || relayReady)
  const remainingContacts = Math.max(0, MIN_CONTACT_TARGET - contacts.length)
  const baseShareUrl = `${window.location.origin}${window.location.pathname}`
  const sharePreview = buildShareMessage(electionState)

  useEffect(() => {
    if (!isInformationalOnly) {
      return
    }

    setPhotoFile(null)
    setContacts([])
    setContactInput('')
    setInputFeedback('')
    setShareFeedback('')
    setActiveRelayMethod(null)
    setLocationFeedback('')
    setIsLocating(false)
    setIsPickingContacts(false)
  }, [isInformationalOnly])

  async function addContacts(rawEntries) {
    const nextContacts = [...contacts]
    const knownValues = new Set(contacts.map((contact) => contact.value))
    const result = {
      added: 0,
      invalid: 0,
    }

    try {
      for (const entry of rawEntries) {
        const detail =
          typeof entry === 'string'
            ? { raw: entry, locality: 'unknown', name: '' }
            : entry

        const normalized = normalizeContact(detail.raw)

        if (!normalized || normalized.kind !== 'phone') {
          result.invalid += 1
          continue
        }

        if (knownValues.has(normalized.value)) {
          continue
        }

        knownValues.add(normalized.value)
        nextContacts.push({
          kind: normalized.kind,
          locality: detail.locality || 'unknown',
          masked: maskContact(normalized.value, normalized.kind),
          name: detail.name || '',
          value: normalized.value,
        })
        result.added += 1
      }

      if (result.added > 0) {
        setContacts(sortContactsByLocality(nextContacts))
        setShareFeedback('')
      }

      setInputFeedback(getContactMessage(result))
      return result
    } catch {
      setInputFeedback('Open this over HTTPS to build the challenge.')
      return result
    }
  }

  async function handleManualAdd(event) {
    event.preventDefault()

    const rawEntries = splitContactInput(contactInput)

    if (rawEntries.length === 0) {
      setInputFeedback('Paste or type at least 3 phone numbers.')
      return
    }

    const result = await addContacts(rawEntries)

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
      const properties = ['name', 'tel']

      if (pickerSupportsAddress) {
        properties.push('address')
      }

      const selectedContacts = await navigator.contacts.select(properties, {
        multiple: true,
      })

      const entries = []

      selectedContacts.forEach((contact) => {
        const candidates = [...(contact.tel || [])].filter(Boolean)

        if (candidates.length === 0) {
          return
        }

        const locality = isLikelyIl9Contact(contact) ? 'local' : 'unknown'

        entries.push({
          raw: candidates[0],
          locality,
          name: getPickedContactName(contact),
        })
      })

      if (entries.length === 0) {
        setInputFeedback('No phone numbers came back from that pick.')
      } else {
        await addContacts(entries)
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
    setContacts(sortContactsByLocality(contacts.filter((contact) => contact.value !== value)))
  }

  function handlePhotoChange(event) {
    const nextFile = event.target.files?.[0] ?? null
    setPhotoFile(nextFile)
  }

  function handleClearPhoto() {
    setPhotoFile(null)
  }

  function finalizeRelayShare(nextMessage) {
    setContacts([])
    setContactInput('')
    setInputFeedback('')
    setShareFeedback(nextMessage)
    setActiveRelayMethod(null)
  }

  function finalizeSimpleShare(nextMessage) {
    setShareFeedback(nextMessage)
  }

  function getShareArtifacts() {
    const publicText = `${buildShareMessage(electionState)}\n\n${baseShareUrl}`

    return {
      publicText,
      textWithoutLink: buildShareMessage(electionState),
    }
  }

  async function handleNativeShare() {
    setActiveRelayMethod(null)
    setInputFeedback('')
    const shareArtifacts = getShareArtifacts()
    const sharePayload = {
      title: 'The IL-9 Vote Challenge',
      text: shareArtifacts.textWithoutLink,
      url: baseShareUrl,
    }

    if (photoFile && typeof navigator.canShare === 'function') {
      try {
        if (navigator.canShare({ files: [photoFile] })) {
          sharePayload.files = [photoFile]
        }
      } catch {
        // Ignore file share capability checks that fail on unsupported browsers.
      }
    }

    try {
      await navigator.share(sharePayload)
      finalizeSimpleShare('Share sheet ready.')
    } catch (error) {
      if (error?.name !== 'AbortError') {
        setShareFeedback('Native share did not finish.')
      }
    }
  }

  function activateRelayMethod(method) {
    setActiveRelayMethod(method)
    setInputFeedback('')
    setShareFeedback('')

    if (contacts.length === 0 && canUseContactPicker && mobileDevice) {
      void handleContactPicker()
    }
  }

  function handleSmsShare() {
    activateRelayMethod(RELAY_METHODS.SMS)

    if (!relayReady) {
      setShareFeedback('Add at least 3 people first.')
      return
    }

    const shareArtifacts = getShareArtifacts()
    const recipients = contacts.map((contact) => contact.value).join(',')
    const separator = isIosDevice() ? '&' : '?'
    const smsUrl = `sms:${recipients}${separator}body=${encodeURIComponent(shareArtifacts.publicText)}`

    finalizeRelayShare('Text ready.')
    openExternalUrl(smsUrl, true)
  }

  function handleWhatsAppShare() {
    activateRelayMethod(RELAY_METHODS.WHATSAPP)

    if (!relayReady) {
      setShareFeedback('Add at least 3 people first.')
      return
    }

    const shareArtifacts = getShareArtifacts()
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareArtifacts.publicText)}`

    finalizeRelayShare('WhatsApp ready.')
    openExternalUrl(whatsappUrl)
  }

  function handleFacebookShare() {
    setActiveRelayMethod(null)
    setInputFeedback('')
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(baseShareUrl)}`

    finalizeSimpleShare('Facebook opened.')
    openExternalUrl(facebookUrl)
  }

  async function handleInstagramShare() {
    setActiveRelayMethod(null)
    setInputFeedback('')
    const shareArtifacts = getShareArtifacts()

    try {
      await copyTextToClipboard(shareArtifacts.publicText)
      finalizeSimpleShare('Caption copied. Instagram opened.')
    } catch {
      finalizeSimpleShare('Instagram opened.')
    }

    openExternalUrl('https://www.instagram.com/')
  }

  async function handleCopyShare() {
    setActiveRelayMethod(null)
    setInputFeedback('')
    const shareArtifacts = getShareArtifacts()

    try {
      await copyTextToClipboard(shareArtifacts.publicText)
      finalizeSimpleShare('Copied. Send it.')
    } catch {
      setShareFeedback('Copy failed on this browser.')
    }
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
              <strong>{isActionable ? 'Vote. Pic. Challenge friends.' : 'Official info only.'}</strong>
            </div>
          </div>
        </section>

        <section className="content-grid">
          {isActionable ? (
            <article className="surface challenge-card" id="challenge">
              <div className="section-head">
                <p className="panel-kicker">Fast challenge</p>
                <h2>Vote, post a pic, challenge friends.</h2>
                <p>{PARTICIPATION_PROMPT}</p>
              </div>

              <div className="quick-steps">
                <span>1. Vote</span>
                <span>2. Pic</span>
                <span>3. Challenge friends</span>
              </div>

              <div className="upload-block">
                <label className="upload-dropzone" htmlFor="challenge-photo">
                  {photoPreviewUrl ? (
                    <img
                      className="photo-preview"
                      src={photoPreviewUrl}
                      alt="Selected voting photo preview"
                    />
                  ) : (
                    <div className="upload-copy">
                      <strong>Add a pic</strong>
                      <span>Vote pic, sticker, or thumbs-up.</span>
                    </div>
                  )}
                </label>

                <input
                  id="challenge-photo"
                  className="visually-hidden"
                  type="file"
                  accept="image/*"
                  capture="user"
                  onChange={handlePhotoChange}
                />

                <div className="upload-actions">
                  <label className="button button-secondary" htmlFor="challenge-photo">
                    {photoFile ? 'Swap pic' : 'Take or upload'}
                  </label>
                  {photoFile && (
                    <button className="button button-ghost" type="button" onClick={handleClearPhoto}>
                      Remove
                    </button>
                  )}
                </div>
              </div>

              <div className="share-panel">
                <div className="share-head">
                  <p className="panel-kicker">Share</p>
                  <span className={`count-pill ${shareUnlocked ? 'is-ready' : ''}`}>
                    {relayMode ? (relayReady ? 'Ready' : 'Need 3+') : 'Pick one'}
                  </span>
                </div>

                <p className="share-preview">{sharePreview}</p>

                <div className="share-actions">
                  {mobileDevice ? (
                    <>
                      {canUseNativeShare && (
                        <button
                          className="button button-primary"
                          type="button"
                          onClick={handleNativeShare}
                        >
                          Share
                        </button>
                      )}
                      <button
                        className={`button ${activeRelayMethod === RELAY_METHODS.SMS ? 'button-primary' : 'button-secondary'}`}
                        type="button"
                        onClick={() => activateRelayMethod(RELAY_METHODS.SMS)}
                      >
                        Text
                      </button>
                      <button
                        className={`button ${activeRelayMethod === RELAY_METHODS.WHATSAPP ? 'button-primary' : 'button-secondary'}`}
                        type="button"
                        onClick={() => activateRelayMethod(RELAY_METHODS.WHATSAPP)}
                      >
                        WhatsApp
                      </button>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={handleInstagramShare}
                      >
                        Instagram
                      </button>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={handleFacebookShare}
                      >
                        Facebook
                      </button>
                      <button className="button button-ghost" type="button" onClick={handleCopyShare}>
                        Copy
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={handleFacebookShare}
                      >
                        Facebook
                      </button>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={handleInstagramShare}
                      >
                        Instagram
                      </button>
                      <button
                        className={`button ${activeRelayMethod === RELAY_METHODS.WHATSAPP ? 'button-primary' : 'button-secondary'}`}
                        type="button"
                        onClick={() => activateRelayMethod(RELAY_METHODS.WHATSAPP)}
                      >
                        WhatsApp
                      </button>
                      <button
                        className={`button ${activeRelayMethod === RELAY_METHODS.SMS ? 'button-primary' : 'button-secondary'}`}
                        type="button"
                        onClick={() => activateRelayMethod(RELAY_METHODS.SMS)}
                      >
                        Text
                      </button>
                      <button className="button button-ghost" type="button" onClick={handleCopyShare}>
                        Copy
                      </button>
                    </>
                  )}
                </div>

                {relayMode && (
                  <div className="relay-panel">
                    <form className="contact-form" onSubmit={handleManualAdd}>
                      <label className="visually-hidden" htmlFor="contact-entry">
                        Add phone numbers
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
                        placeholder={'Paste 3+ phone numbers\nOne per line, comma, or semicolon'}
                      />
                      <button className="button button-secondary" type="submit">
                        Add numbers
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
                          {isPickingContacts ? 'Opening…' : 'Search phone'}
                        </button>
                      )}
                    </div>

                    <div className="challenge-progress">
                      <span className={`count-pill ${relayReady ? 'is-ready' : ''}`}>
                        {relayReady ? `${contacts.length} picked` : `${contacts.length}/${MIN_CONTACT_TARGET}`}
                      </span>
                      <span className="progress-text">
                        {relayReady ? 'Ready to open' : `Add ${remainingContacts} more`}
                      </span>
                    </div>

                    {inputFeedback && <p className="inline-note">{inputFeedback}</p>}

                    <ul className="contact-list">
                      {contacts.length === 0 ? (
                        <li className="empty-state">No people yet. Add a few and go.</li>
                      ) : (
                        contacts.map((contact) => (
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
                      onClick={
                        activeRelayMethod === RELAY_METHODS.SMS
                          ? handleSmsShare
                          : handleWhatsAppShare
                      }
                      disabled={!relayReady}
                    >
                      {activeRelayMethod === RELAY_METHODS.SMS ? 'Open text' : 'Open WhatsApp'}
                    </button>
                  </div>
                )}

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
                  className="inline-resource"
                  href={link.href}
                  key={link.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  <strong>{link.label}</strong>
                  <span>{link.description}</span>
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
