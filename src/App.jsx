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
import {
  buildRelayUrl,
  contactToToken,
  copyTextToClipboard,
  decodeTokenChain,
  getRelayCapacity,
  maskContact,
  normalizeContact,
} from './lib/relay'

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function openExternalUrl(url, preferSameWindow = false) {
  if (preferSameWindow) {
    window.location.href = url
    return
  }

  window.open(url, '_blank', 'noopener,noreferrer')
}

function getContactMessage(result) {
  if (result.added === 0 && result.invalid > 0) {
    return 'Use a valid US phone number or email address.'
  }

  if (result.added === 0 && result.duplicates > 0) {
    return 'That person is already in this relay chain.'
  }

  if (result.added > 0 && result.duplicates > 0) {
    return `Added ${result.added} new contact${result.added === 1 ? '' : 's'}. Duplicate entries were skipped.`
  }

  if (result.added > 0 && result.invalid > 0) {
    return `Added ${result.added} contact${result.added === 1 ? '' : 's'}. Invalid entries were skipped.`
  }

  if (result.added > 0) {
    return `Added ${result.added} contact${result.added === 1 ? '' : 's'} to your relay.`
  }

  return ''
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
  const [priorTokens, setPriorTokens] = useState([])
  const [inputFeedback, setInputFeedback] = useState('')
  const [shareFeedback, setShareFeedback] = useState('')
  const [locationFeedback, setLocationFeedback] = useState('')
  const [isLocating, setIsLocating] = useState(false)
  const [isPickingContacts, setIsPickingContacts] = useState(false)

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(new Date())
    }, 30000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    const currentUrl = new URL(window.location.href)
    const encodedTokens = currentUrl.searchParams.get('c')

    if (encodedTokens) {
      setPriorTokens(decodeTokenChain(encodedTokens))
      currentUrl.searchParams.delete('c')
      const cleanPath = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`
      window.history.replaceState({}, '', cleanPath || currentUrl.pathname)
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
  const canUseNativeShare =
    isActionable &&
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function'
  const canUseContactPicker =
    isActionable &&
    typeof navigator !== 'undefined' &&
    typeof navigator.contacts !== 'undefined' &&
    typeof navigator.contacts.select === 'function'
  const shareUnlocked = isActionable && contacts.length >= 3
  const baseShareUrl = `${window.location.origin}${window.location.pathname}`
  const relaySnapshot = buildRelayUrl(
    baseShareUrl,
    priorTokens,
    contacts.map((contact) => contact.token),
  )
  const relayCapacity = getRelayCapacity(baseShareUrl)
  const sharePreview = buildShareMessage(electionState, '[your relay link]')

  useEffect(() => {
    if (!isInformationalOnly) {
      return
    }

    setPhotoFile(null)
    setContacts([])
    setContactInput('')
    setInputFeedback('')
    setShareFeedback('')
    setLocationFeedback('')
    setIsLocating(false)
    setIsPickingContacts(false)
  }, [isInformationalOnly])

  async function addContacts(rawContacts) {
    const nextContacts = [...contacts]
    const knownTokens = new Set([
      ...priorTokens,
      ...contacts.map((contact) => contact.token),
    ])
    const result = {
      added: 0,
      duplicates: 0,
      invalid: 0,
    }

    try {
      for (const rawContact of rawContacts) {
        const normalized = normalizeContact(rawContact)

        if (!normalized) {
          result.invalid += 1
          continue
        }

        const token = await contactToToken(normalized.value)

        if (knownTokens.has(token)) {
          result.duplicates += 1
          continue
        }

        knownTokens.add(token)
        nextContacts.push({
          kind: normalized.kind,
          masked: maskContact(normalized.value, normalized.kind),
          token,
          value: normalized.value,
        })
        result.added += 1
      }

      if (result.added > 0) {
        setContacts(nextContacts)
        setShareFeedback('')
      }

      setInputFeedback(getContactMessage(result))
      return result
    } catch {
      setInputFeedback('Secure hashing is unavailable. Open the site over HTTPS to build the relay.')
      return result
    }
  }

  async function handleManualAdd(event) {
    event.preventDefault()

    const trimmedInput = contactInput.trim()

    if (!trimmedInput) {
      setInputFeedback('Add a phone number or email address to keep the relay moving.')
      return
    }

    const result = await addContacts([trimmedInput])

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
      const selectedContacts = await navigator.contacts.select(['tel', 'email'], {
        multiple: true,
      })
      const candidateValues = selectedContacts
        .map((contact) => contact.tel?.[0] ?? contact.email?.[0] ?? '')
        .filter(Boolean)

      if (candidateValues.length === 0) {
        setInputFeedback('No phone numbers or emails came back from the contact picker.')
      } else {
        await addContacts(candidateValues)
      }
    } catch (error) {
      if (error?.name !== 'AbortError') {
        setInputFeedback('Your phone contact picker did not complete. You can still add contacts manually.')
      }
    } finally {
      setIsPickingContacts(false)
    }
  }

  function handleRemoveContact(token) {
    setContacts(contacts.filter((contact) => contact.token !== token))
  }

  function handlePhotoChange(event) {
    const nextFile = event.target.files?.[0] ?? null
    setPhotoFile(nextFile)
  }

  function handleClearPhoto() {
    setPhotoFile(null)
  }

  function finalizeShare(nextTokens, nextMessage) {
    setPriorTokens(nextTokens)
    setContacts([])
    setContactInput('')
    setInputFeedback('')
    setShareFeedback(nextMessage)
  }

  function getShareArtifacts() {
    const snapshot = buildRelayUrl(
      baseShareUrl,
      priorTokens,
      contacts.map((contact) => contact.token),
    )

    return {
      chainTokens: snapshot.tokens,
      shareUrl: snapshot.shareUrl,
      textWithLink: buildShareMessage(electionState, snapshot.shareUrl),
      textWithoutLink: buildShareMessage(electionState),
    }
  }

  async function handleNativeShare() {
    if (!shareUnlocked) {
      setShareFeedback('Add at least 3 people before you share this relay.')
      return
    }

    const shareArtifacts = getShareArtifacts()
    const sharePayload = {
      title: 'IL-9 Voting Relay',
      text: shareArtifacts.textWithoutLink,
      url: shareArtifacts.shareUrl,
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
      finalizeShare(
        shareArtifacts.chainTokens,
        'Your relay is ready to send from the native share sheet.',
      )
    } catch (error) {
      if (error?.name !== 'AbortError') {
        setShareFeedback('Native sharing did not complete. Use text, WhatsApp, or copy instead.')
      }
    }
  }

  function handleSmsShare() {
    if (!shareUnlocked) {
      setShareFeedback('Add at least 3 people before you share this relay.')
      return
    }

    const shareArtifacts = getShareArtifacts()
    const separator = isIosDevice() ? '&' : '?'
    const smsUrl = `sms:${separator}body=${encodeURIComponent(shareArtifacts.textWithLink)}`

    finalizeShare(
      shareArtifacts.chainTokens,
      'Messages opened with your time-aware relay text.',
    )
    openExternalUrl(smsUrl, true)
  }

  function handleWhatsAppShare() {
    if (!shareUnlocked) {
      setShareFeedback('Add at least 3 people before you share this relay.')
      return
    }

    const shareArtifacts = getShareArtifacts()
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareArtifacts.textWithLink)}`

    finalizeShare(
      shareArtifacts.chainTokens,
      'WhatsApp opened with your relay message.',
    )
    openExternalUrl(whatsappUrl)
  }

  async function handleCopyShare() {
    if (!shareUnlocked) {
      setShareFeedback('Add at least 3 people before you share this relay.')
      return
    }

    const shareArtifacts = getShareArtifacts()

    try {
      await copyTextToClipboard(shareArtifacts.textWithLink)
      finalizeShare(
        shareArtifacts.chainTokens,
        'Copied a time-aware relay message with your compact link.',
      )
    } catch {
      setShareFeedback('Copy failed on this browser. Try native share, text, or WhatsApp.')
    }
  }

  function handleLocate() {
    if (!isActionable) {
      return
    }

    if (!navigator.geolocation) {
      setLocationFeedback('Location access is unavailable in this browser. Use the official links below instead.')
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
        setLocationFeedback('Location was blocked. Use the official area-specific links below instead.')
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

      <main className="relay-page">
        <section className="hero-panel surface">
          <div className="hero-copy">
            <p className="eyebrow">
              {isInformationalOnly ? 'IL-9 Voter Information' : 'IL-9 Voting Relay'}
            </p>
            <div className="headline-row">
              <span className="state-pill">{stateContent.badge}</span>
              <span className="time-pill">Chicago time: {chicagoNow}</span>
            </div>
            <h1>{stateContent.headline}</h1>
            <p className="hero-lead">{stateContent.lead}</p>
            <p className="hero-guidance">{stateContent.guidance}</p>

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
                  <a className="button button-secondary" href="#relay">
                    Build the 3-person relay
                  </a>
                </>
              ) : (
                <a className="button button-primary" href="#official">
                  View official voter information
                </a>
              )}
            </div>

            {locationFeedback && <p className="inline-note">{locationFeedback}</p>}
          </div>

          <aside className="hero-brief">
            <p className="brief-label">
              {isInformationalOnly ? 'Info-only mode' : 'Why this page works'}
            </p>
            <div className="brief-grid">
              {isInformationalOnly ? (
                <>
                  <div className="brief-card">
                    <strong>Relay disabled</strong>
                    <span>The share challenge, photo flow, and contact builder are turned off after polls close.</span>
                  </div>
                  <div className="brief-card">
                    <strong>Official resources only</strong>
                    <span>This page stays useful as a voter-information hub for Chicago, suburban Cook, and Lake County.</span>
                  </div>
                  <div className="brief-card">
                    <strong>Ready for the next cycle</strong>
                    <span>Registration and voter lookup links stay available so the site can guide next-step action without stale urgency.</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="brief-card">
                    <strong>Current-date copy</strong>
                    <span>The page and message shift with Chicago time.</span>
                  </div>
                  <div className="brief-card">
                    <strong>Official sources</strong>
                    <span>Local voter info stays one tap away for Chicago, suburban Cook, and Lake.</span>
                  </div>
                  <div className="brief-card">
                    <strong>No server</strong>
                    <span>Contacts stay on this device. The link only carries compact relay tokens.</span>
                  </div>
                </>
              )}
            </div>
          </aside>
        </section>

        <section className="status-grid">
          {stateContent.statusCards.map((card) => (
            <article className="status-card surface" key={card.label}>
              <p className="status-label">{card.label}</p>
              <p className="status-value">{card.value}</p>
            </article>
          ))}
        </section>

        <section className="main-grid">
          <article className="surface official-panel" id="official">
            <div className="panel-header">
              <p className="panel-kicker">Official voting info</p>
              <h2>
                {isInformationalOnly
                  ? 'The relay is closed. This page is now an info hub.'
                  : 'Pick the right local source for your part of IL-9.'}
              </h2>
              <p>
                {isInformationalOnly
                  ? 'Use the official pages below for voter information, registration status, election offices, and the next steps after this election window.'
                  : 'Use the official pages below to confirm your site, ballot, registration details, and local election instructions.'}
              </p>
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

            <div className="resource-collection">
              <div className="resource-intro">
                <strong>{jurisdiction.region}</strong>
                <span>{jurisdiction.label} voters</span>
              </div>

              {jurisdiction.links.map((link) => (
                <a
                  className="resource-card"
                  href={link.href}
                  key={link.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="resource-title">{link.label}</span>
                  <span className="resource-description">{link.description}</span>
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

          {isActionable ? (
            <article className="surface relay-panel" id="relay">
              <div className="panel-header">
                <p className="panel-kicker">Post your proof</p>
                <h2>Already voted? A sticker pic or thumbs-up selfie still counts.</h2>
                <p>{PARTICIPATION_PROMPT}</p>
              </div>

              <div className="upload-stack">
                <label className="upload-dropzone" htmlFor="relay-photo">
                  {photoPreviewUrl ? (
                    <img
                      className="photo-preview"
                      src={photoPreviewUrl}
                      alt="Selected voting photo preview"
                    />
                  ) : (
                    <div className="upload-copy">
                      <strong>Use your front camera or camera roll</strong>
                      <span>Voting photo, sticker shot, or a simple thumbs-up selfie.</span>
                    </div>
                  )}
                </label>

                <input
                  id="relay-photo"
                  className="visually-hidden"
                  type="file"
                  accept="image/*"
                  capture="user"
                  onChange={handlePhotoChange}
                />

                <div className="upload-actions">
                  <label className="button button-secondary" htmlFor="relay-photo">
                    {photoFile ? 'Replace photo' : 'Take or upload a photo'}
                  </label>
                  {photoFile && (
                    <button
                      className="button button-ghost"
                      type="button"
                      onClick={handleClearPhoto}
                    >
                      Remove photo
                    </button>
                  )}
                </div>
              </div>

              <div className="relay-builder">
                <div className="builder-header">
                  <div>
                    <p className="panel-kicker">Build the challenge</p>
                    <h3>Add 3 people by phone or email.</h3>
                  </div>
                  <p className="relay-note">
                    Relay memory if you share now: {relaySnapshot.tokens.length} used of about{' '}
                    {relayCapacity} compact slots.
                  </p>
                </div>

                <form className="contact-form" onSubmit={handleManualAdd}>
                  <label className="visually-hidden" htmlFor="contact-entry">
                    Add a phone number or email address
                  </label>
                  <input
                    id="contact-entry"
                    className="text-input"
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    value={contactInput}
                    onChange={(event) => setContactInput(event.target.value)}
                    placeholder="312 555 1234 or voter@example.com"
                  />
                  <button className="button button-primary" type="submit">
                    Add contact
                  </button>
                </form>

                <div className="picker-row">
                  <span>Local-only relay: raw contacts never enter the shared message.</span>
                  {canUseContactPicker && (
                    <button
                      className="button button-ghost"
                      type="button"
                      onClick={handleContactPicker}
                      disabled={isPickingContacts}
                    >
                      {isPickingContacts ? 'Opening contacts...' : 'Use phone contacts'}
                    </button>
                  )}
                </div>

                <div className="progress-block">
                  <div className="progress-label">
                    <strong>{Math.min(contacts.length, 3)} of 3 ready</strong>
                    <span>
                      {contacts.length >= 3
                        ? 'Your relay is unlocked.'
                        : `Add ${3 - contacts.length} more to unlock sharing.`}
                    </span>
                  </div>
                  <div className="progress-bars" aria-hidden="true">
                    {[0, 1, 2].map((slot) => (
                      <span
                        className={`progress-bar ${contacts.length > slot ? 'is-filled' : ''}`}
                        key={slot}
                      />
                    ))}
                  </div>
                </div>

                {inputFeedback && <p className="inline-note">{inputFeedback}</p>}

                <ul className="contact-list">
                  {contacts.length === 0 ? (
                    <li className="empty-state">No relay contacts yet. Start with 3 people you can nudge today.</li>
                  ) : (
                    contacts.map((contact) => (
                      <li className="contact-item" key={contact.token}>
                        <div className="contact-copy">
                          <span className="contact-kind">{contact.kind}</span>
                          <strong>{contact.masked}</strong>
                        </div>
                        <button
                          className="button button-inline"
                          type="button"
                          onClick={() => handleRemoveContact(contact.token)}
                        >
                          Remove
                        </button>
                      </li>
                    ))
                  )}
                </ul>

                {priorTokens.length > 0 && (
                  <p className="relay-footnote">
                    This link already arrived with {priorTokens.length} prior relay token
                    {priorTokens.length === 1 ? '' : 's'}. Reused contacts are blocked automatically.
                  </p>
                )}
              </div>

              <div className="share-panel">
                <div className="share-header">
                  <div>
                    <p className="panel-kicker">Share it</p>
                    <h3>Time-aware copy, native on phones, compact in the URL.</h3>
                  </div>
                  <span className={`unlock-pill ${shareUnlocked ? 'is-ready' : ''}`}>
                    {shareUnlocked ? 'Ready to share' : 'Need 3 contacts'}
                  </span>
                </div>

                <p className="share-preview">{sharePreview}</p>

                <div className="share-actions">
                  {canUseNativeShare && (
                    <button
                      className="button button-primary"
                      type="button"
                      onClick={handleNativeShare}
                      disabled={!shareUnlocked}
                    >
                      Native share
                    </button>
                  )}
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={handleSmsShare}
                    disabled={!shareUnlocked}
                  >
                    Text message
                  </button>
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={handleWhatsAppShare}
                    disabled={!shareUnlocked}
                  >
                    WhatsApp
                  </button>
                  <button
                    className="button button-ghost"
                    type="button"
                    onClick={handleCopyShare}
                    disabled={!shareUnlocked}
                  >
                    Copy message
                  </button>
                </div>

                <div className="privacy-banner">
                  <strong>No server. No raw contacts in the message.</strong>
                  <span>
                    The URL only carries compact, fixed-length relay tokens and trims older entries
                    automatically to stay shareable.
                  </span>
                </div>

                {shareFeedback && <p className="inline-note success-note">{shareFeedback}</p>}
              </div>
            </article>
          ) : (
            <article className="surface next-panel">
              <div className="panel-header">
                <p className="panel-kicker">This round is closed</p>
                <h2>The vote-now relay is off.</h2>
                <p>
                  Keep the site useful after polls close: point people to official voter
                  information, keep registration current, and be ready for the next election.
                </p>
              </div>

              <div className="next-steps">
                <div className="next-step">
                  <strong>Check official voter info</strong>
                  <span>Use your local election authority to confirm results, status, and future notices.</span>
                </div>
                <div className="next-step">
                  <strong>Stay registration-ready</strong>
                  <span>Use the official statewide registration tools before the next election cycle opens.</span>
                </div>
                <div className="next-step">
                  <strong>Come back for the next window</strong>
                  <span>This page will become actionable again when its election config is updated.</span>
                </div>
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
          )}
        </section>
      </main>
    </div>
  )
}

export default App
