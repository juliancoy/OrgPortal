export type UserRole = 'constituent' | 'campaign_manager'

export type UserHandle = string

export type AdminProfile = {
  displayName: string
  handle: UserHandle
  bio?: string
}

export type UserProfile = {
  displayName: string
  handle: UserHandle
  bio?: string
}

export type ConstituentProfile = UserProfile

export type CandidacyInfo = {
  isRunning: boolean
  officeTitle?: string
  campaignStatement?: string
}
