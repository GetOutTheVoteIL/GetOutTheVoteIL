export const PARTICIPATION_PROMPT =
  'Already voted? A sticker pic or thumbs-up selfie counts.'

export const ELECTION_STATES = {
  EARLY_VOTING_OPEN: 'early_voting_open',
  ELECTION_DAY_BEFORE_OPEN: 'election_day_before_open',
  ELECTION_DAY_OPEN: 'election_day_open',
  TOO_LATE: 'too_late',
}

export const electionConfig = {
  name: 'Illinois General Primary',
  timeZone: 'America/Chicago',
  electionDate: '2026-03-17',
  electionDateLabel: 'Tuesday, March 17',
  earlyVotingDateLabel: 'Monday, March 2 through Monday, March 16',
  earlyVotingEndLabel: 'Monday, March 16',
  onlineRegistrationClosedLabel: 'Sunday, March 1',
  mailBallotClosedLabel: 'Thursday, March 12',
  pollHoursLabel: '6:00 a.m. to 7:00 p.m. CT',
  pollCloseLabel: '7:00 p.m. CT',
  earlyVotingStart: '2026-03-02',
  earlyVotingEnd: '2026-03-16',
  electionDayOpenMinutes: 6 * 60,
  electionDayCloseMinutes: 19 * 60,
  statewideLinks: [
    {
      label: 'Vote.gov Illinois',
      href: 'https://vote.gov/register/illinois',
      description: 'Registration and statewide voter guidance.',
    },
  ],
  jurisdictions: {
    chicago: {
      label: 'Chicago',
      region: 'Chicago Board of Elections',
      links: [
        {
          label: 'Your Voter Information',
          href: 'https://www.chicagoelections.gov/en/your-voter-information.html',
          description: 'Find your polling place, sample ballot, and registration status.',
        },
        {
          label: 'Early Voting',
          href: 'https://www.chicagoelections.gov/en/early-voting.html',
          description: 'Official Chicago early voting hours and site information.',
        },
      ],
    },
    suburbanCook: {
      label: 'Suburban Cook',
      region: 'Cook County Clerk',
      links: [
        {
          label: 'Your Voter Information',
          href: 'https://www.cookcountyclerkil.gov/service/your-voter-information',
          description: 'Look up your registration, polling place, and ballot details.',
        },
        {
          label: 'March 17 Important Dates',
          href: 'https://www.cookcountyclerkil.gov/sites/default/files/pdfs/important-dates-and-signature-requirements-handout_031726_updated073125.pdf',
          description: 'Official deadline sheet for the March 17, 2026 primary.',
        },
        {
          label: 'Cook County Elections',
          href: 'https://www.cookcountyclerkil.gov/elections',
          description: 'Official county election resources and announcements.',
        },
      ],
    },
    lakeCounty: {
      label: 'Lake County',
      region: 'Lake County Clerk',
      links: [
        {
          label: 'March 17 Election',
          href: 'https://www.lakecountyil.gov/4138/March-17-2026-General-Primary-Election',
          description: 'Official Lake County page for the March 17, 2026 primary.',
        },
        {
          label: 'Early Voting',
          href: 'https://www.lakecountyil.gov/4322/Early-Voting',
          description: 'Early voting dates, grace-period registration, and requirements.',
        },
        {
          label: 'Election Details',
          href: 'https://www.lakecountyil.gov/335/Election-Details',
          description: 'General voter tools, polling info, and election administration links.',
        },
      ],
    },
  },
}

const zonedPartsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: electionConfig.timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

const chicagoNowFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: electionConfig.timeZone,
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

function padNumber(value) {
  return String(value).padStart(2, '0')
}

export function getChicagoDateParts(date = new Date()) {
  const parts = zonedPartsFormatter.formatToParts(date)
  const valueMap = {}

  parts.forEach((part) => {
    if (part.type !== 'literal') {
      valueMap[part.type] = Number(part.value)
    }
  })

  return {
    year: valueMap.year,
    month: valueMap.month,
    day: valueMap.day,
    hour: valueMap.hour,
    minute: valueMap.minute,
    second: valueMap.second,
  }
}

export function getChicagoDateKey(date = new Date()) {
  const parts = getChicagoDateParts(date)

  return `${parts.year}-${padNumber(parts.month)}-${padNumber(parts.day)}`
}

export function deriveElectionState(date = new Date(), config = electionConfig) {
  const chicagoDateKey = getChicagoDateKey(date)

  if (chicagoDateKey < config.electionDate) {
    return ELECTION_STATES.EARLY_VOTING_OPEN
  }

  if (chicagoDateKey > config.electionDate) {
    return ELECTION_STATES.TOO_LATE
  }

  const { hour, minute, second } = getChicagoDateParts(date)
  const currentMinutes = hour * 60 + minute + second / 60

  if (currentMinutes < config.electionDayOpenMinutes) {
    return ELECTION_STATES.ELECTION_DAY_BEFORE_OPEN
  }

  if (currentMinutes < config.electionDayCloseMinutes) {
    return ELECTION_STATES.ELECTION_DAY_OPEN
  }

  return ELECTION_STATES.TOO_LATE
}

export function formatChicagoNow(date = new Date()) {
  return `${chicagoNowFormatter.format(date)} CT`
}

export function buildShareMessage(state, config = electionConfig) {
  switch (state) {
    case ELECTION_STATES.ELECTION_DAY_BEFORE_OPEN:
      return `The IL-9 Vote Challenge is live: vote today, post a pic, and challenge friends before ${config.pollCloseLabel}. ${PARTICIPATION_PROMPT}`.trim()
    case ELECTION_STATES.ELECTION_DAY_OPEN:
      return `The IL-9 Vote Challenge is live: vote before ${config.pollCloseLabel}, post a pic, and challenge friends. ${PARTICIPATION_PROMPT}`.trim()
    case ELECTION_STATES.TOO_LATE:
      return 'Voting for this election has ended.'
    case ELECTION_STATES.EARLY_VOTING_OPEN:
    default:
      return `The IL-9 Vote Challenge is live: vote early by ${config.earlyVotingEndLabel}, post a pic, and challenge friends. ${PARTICIPATION_PROMPT}`.trim()
  }
}

export function getStateContent(state, config = electionConfig) {
  switch (state) {
    case ELECTION_STATES.ELECTION_DAY_BEFORE_OPEN:
      return {
        badge: 'Polls open today',
        headline: 'Election Day. Polls open this morning.',
        lead: 'It is especially important for our community to vote in this cycle.',
        mapQuery: 'polling place',
        mapButtonLabel: 'Find my spot',
        statusCards: [
          {
            label: 'Today',
            value: `Polls: ${config.pollHoursLabel}`,
          },
          {
            label: 'Still okay',
            value: 'Grace registration is still available.',
          },
          {
            label: 'Mail ballot',
            value: `Application deadline passed ${config.mailBallotClosedLabel}.`,
          },
        ],
        guidance: 'Use the official links below for the exact site and rules.',
      }
    case ELECTION_STATES.ELECTION_DAY_OPEN:
      return {
        badge: 'Polls are open',
        headline: 'Vote today before 7:00 p.m.',
        lead: 'It is especially important for our community to vote in this cycle.',
        mapQuery: 'polling place',
        mapButtonLabel: 'Find my spot',
        statusCards: [
          {
            label: 'Right now',
            value: `Open until ${config.pollCloseLabel}.`,
          },
          {
            label: 'Early vote',
            value: 'Early voting ended Monday, March 16.',
          },
          {
            label: 'Still okay',
            value: 'Grace registration is still available.',
          },
        ],
        guidance: 'Use the official links below for the exact site and rules.',
      }
    case ELECTION_STATES.TOO_LATE:
      return {
        badge: 'This round is over',
        headline: 'Voting is closed.',
        lead: 'Official info only from here.',
        mapQuery: 'board of elections office',
        mapButtonLabel: 'Official voter info',
        statusCards: [
          {
            label: 'Closed',
            value: `Polls closed at ${config.pollCloseLabel} on ${config.electionDateLabel}.`,
          },
          {
            label: 'What now',
            value: 'Check official voter information and future election resources.',
          },
          {
            label: 'Stay ready',
            value: 'Use official registration and voter lookup tools for the next election.',
          },
        ],
        guidance: 'The challenge shuts off after polls close.',
      }
    case ELECTION_STATES.EARLY_VOTING_OPEN:
    default:
      return {
        badge: 'Early voting is open',
        headline: 'Vote early now. Election Day is Tuesday, March 17.',
        lead: 'It is especially important for our community to vote in this cycle.',
        mapQuery: 'early voting',
        mapButtonLabel: 'Find early voting',
        statusCards: [
          {
            label: 'Vote early',
            value: `Through ${config.earlyVotingEndLabel}.`,
          },
          {
            label: 'Election Day',
            value: `${config.electionDateLabel}.`,
          },
          {
            label: 'Still okay',
            value: 'Grace registration is still available.',
          },
        ],
        guidance: 'Use the official links below for the exact site and rules.',
      }
  }
}

export function getMapsQueryForState(state, config = electionConfig) {
  const stateContent = getStateContent(state, config)

  return stateContent.mapQuery
}
