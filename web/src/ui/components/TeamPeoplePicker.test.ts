import { describe, expect, it } from 'vitest'
import { readTeamPeople } from './TeamPeoplePicker'

describe('team roster drafts', () => {
 it('restores account selections and pending email avatars', () => {
  const people = [{ userId: 'portal-person', name: 'Taylor', photo: 'https://example.com/avatar.png' }, { name: 'new@example.com', email: 'new@example.com' }]
  expect(readTeamPeople(JSON.stringify(people))).toEqual(people)
 })
 it('discards malformed drafts and entries without an identity or valid email', () => {
  for (const value of ['{', '{}', 'null', JSON.stringify([{ name: 'Missing identity' }, { name: 'Bad email', email: 'bad' }, { name: 'Bad photo', userId: 'person', photo: 'javascript:alert(1)' }])]) expect(readTeamPeople(value)).toEqual([])
 })
 it('rejects oversized rosters', () => {
  expect(readTeamPeople(JSON.stringify(Array.from({ length: 51 }, () => ({ name: 'Person', userId: 'person' }))))).toEqual([])
 })
})
