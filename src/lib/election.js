export const PARTICIPATION_PROMPT =
  'If you already voted, post your voting photo, your sticker, or a thumbs-up selfie.'

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

export function buildShareMessage(
  state,
  shareUrl = '',
  config = electionConfig,
) {
  const linkSentence = shareUrl ? ` ${shareUrl}` : ''

  switch (state) {
    case ELECTION_STATES.ELECTION_DAY_BEFORE_OPEN:
      return `Election Day is today. Polls open this morning and close at ${config.pollCloseLabel}. ${PARTICIPATION_PROMPT}${shareUrl ? ` Make your plan here:${linkSentence}` : ''}`.trim()
    case ELECTION_STATES.ELECTION_DAY_OPEN:
      return `Election Day is today. Vote before ${config.pollCloseLabel}. ${PARTICIPATION_PROMPT}${shareUrl ? ` Then send this to 3 people who still can:${linkSentence}` : ''}`.trim()
    case ELECTION_STATES.TOO_LATE:
      return `Voting for this election has ended.${shareUrl ? ` Stay ready for the next one with official IL-9 voter info here:${linkSentence}` : ''}`.trim()
    case ELECTION_STATES.EARLY_VOTING_OPEN:
    default:
      return `Early voting is open now through ${config.earlyVotingEndLabel}. I'm getting 3 people to make a plan before ${config.electionDateLabel}. ${PARTICIPATION_PROMPT}${shareUrl ? ` Check your site here:${linkSentence}` : ''}`.trim()
  }
}

export function getStateContent(state, config = electionConfig) {
  switch (state) {
    case ELECTION_STATES.ELECTION_DAY_BEFORE_OPEN:
      return {
        badge: 'Today is Election Day',
        headline: 'Election Day is today. Polls open this morning.',
        lead:
          'Your move is simple: confirm your site, get ready to vote, and text 3 people before the day slips away.',
        mapQuery: 'polling place',
        mapButtonLabel: 'Find my polling place',
        statusCards: [
          {
            label: 'Poll hours',
            value: config.pollHoursLabel,
          },
          {
            label: 'Registration',
            value: 'Grace-period registration is still available through official local processes.',
          },
          {
            label: 'Mail ballots',
            value: `Applications closed ${config.mailBallotClosedLabel}.`,
          },
        ],
        guidance:
          'Use your local election page for the exact site, ballot, and registration details you need this morning.',
      }
    case ELECTION_STATES.ELECTION_DAY_OPEN:
      return {
        badge: 'Polls are open now',
        headline: 'Election Day is today. Vote before 7:00 p.m.',
        lead:
          'This is the live voting window. Vote now, post your proof, and push 3 more people to act while polls are open.',
        mapQuery: 'polling place',
        mapButtonLabel: 'Find my polling place',
        statusCards: [
          {
            label: 'Right now',
            value: `Polls are open until ${config.pollCloseLabel}.`,
          },
          {
            label: 'Early voting',
            value: 'Early voting ended Monday, March 16.',
          },
          {
            label: 'Registration',
            value: 'Grace-period registration remains available through official local processes.',
          },
        ],
        guidance:
          'Open your official local voter page now to confirm the exact site and any same-day registration instructions.',
      }
    case ELECTION_STATES.TOO_LATE:
      return {
        badge: 'This election is closed',
        headline: 'Voting for this election has ended.',
        lead:
          'The vote-now relay is off. Use the official links below to confirm results, keep your registration current, and stay ready for the next election.',
        mapQuery: 'board of elections office',
        mapButtonLabel: 'Official voter resources',
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
        guidance:
          'This page stops challenge sharing automatically after the close of polls so it never tells people to vote too late.',
      }
    case ELECTION_STATES.EARLY_VOTING_OPEN:
    default:
      return {
        badge: 'Early voting is open',
        headline: 'Early voting is open now. Election Day is Tuesday, March 17.',
        lead:
          'Make your plan now, use an official site to confirm where to go, and challenge 3 people while there is still time to act.',
        mapQuery: 'early voting',
        mapButtonLabel: 'Find early voting near me',
        statusCards: [
          {
            label: 'Window',
            value: `Early voting runs ${config.earlyVotingDateLabel}.`,
          },
          {
            label: 'Election Day',
            value: `${config.electionDateLabel} from ${config.pollHoursLabel}.`,
          },
          {
            label: 'Registration',
            value: 'Online registration has closed, but local grace-period options remain available.',
          },
        ],
        guidance:
          'Use the official local links below to confirm an early voting site, registration status, and ballot details before you share.',
      }
  }
}

export function getMapsQueryForState(state, config = electionConfig) {
  const stateContent = getStateContent(state, config)

  return stateContent.mapQuery
}
