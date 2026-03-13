const IL9_CITY_HINTS = [
  'chicago',
  'evanston',
  'skokie',
  'lincolnwood',
  'niles',
  'morton grove',
  'glenview',
  'park ridge',
  'des plaines',
  'northbrook',
  'wilmette',
  'winnetka',
  'kenilworth',
  'glencoe',
  'highland park',
  'deerfield',
  'buffalo grove',
  'wheeling',
  'prospect heights',
  'arlington heights',
  'mount prospect',
  'lake forest',
  'libertyville',
  'vernon hills',
  'mundelein',
  'wauconda',
  'lake zurich',
  'bannockburn',
  'north chicago',
  'gurnee',
  'waukegan',
  'grayslake',
]

const COUNTY_HINTS = ['cook county', 'lake county']
const ILLINOIS_HINTS = [' il ', ' illinois ']

function normalizeText(value) {
  return ` ${String(value || '').trim().toLowerCase()} `
}

function addressToSearchText(address) {
  const lines = Array.isArray(address?.addressLine)
    ? address.addressLine
    : [address?.addressLine]

  return normalizeText(
    [
      address?.city,
      address?.region,
      address?.country,
      address?.postalCode,
      address?.dependentLocality,
      ...lines,
    ]
      .filter(Boolean)
      .join(' '),
  )
}

export function isLikelyIl9Contact(contact) {
  const addresses = Array.isArray(contact?.address) ? contact.address : []

  if (addresses.length === 0) {
    return false
  }

  return addresses.some((address) => {
    const text = addressToSearchText(address)
    const hasCountyHint = COUNTY_HINTS.some((hint) => text.includes(hint))
    const hasCityHint = IL9_CITY_HINTS.some((hint) => text.includes(` ${hint} `))
    const hasIllinoisSignal = ILLINOIS_HINTS.some((hint) => text.includes(hint)) || hasCountyHint

    return (hasCityHint || hasCountyHint) && hasIllinoisSignal
  })
}

export function getPickedContactName(contact) {
  if (!Array.isArray(contact?.name) || contact.name.length === 0) {
    return ''
  }

  return String(contact.name[0] || '').trim()
}
