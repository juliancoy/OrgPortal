import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'

export function GlobalSearchForm({ initialQuery = '' }: { initialQuery?: string }) {
  const navigate = useNavigate()
  const id = useId()
  const [query, setQuery] = useState(initialQuery)
  const [error, setError] = useState('')
  return <form className="global-search-form" role="search" onSubmit={event => {
    event.preventDefault()
    const value = query.trim()
    if (value.length < 2) { setError('Enter at least 2 characters.'); return }
    navigate(`/search?q=${encodeURIComponent(value)}`)
  }}>
    <label htmlFor={id}>Search organizations, events, and people</label>
    <div className="global-search-form-row">
      <input id={id} name="q" type="search" value={query} required minLength={2}
        placeholder="Search by name, topic, or place"
        onChange={event => { setQuery(event.target.value); setError('') }}
        aria-describedby={error ? `${id}-error` : undefined} />
      <button className="btn-primary" type="submit">Search</button>
    </div>
    {error && <p id={`${id}-error`} role="status">{error}</p>}
  </form>
}
