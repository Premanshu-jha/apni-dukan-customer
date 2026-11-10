import { useEffect, useRef, useState } from 'react'
import { useRateVisit } from '../../api/bookings'
import { fieldError, isApiError, messageOf } from '../../api/errors'
import type { Booking, RatingTag } from '../../api/types'
import { Banner, Button, Card, Chip } from '../../components/ui'
import { dateTimeIst } from '../../lib/ist'
import { canRate, MAX_COMMENT, TAGS } from '../../lib/ratings'

const WORDS = ['', 'Poor', 'Not great', 'Okay', 'Good', 'Excellent']

/**
 * Rating a completed visit (and changing the rating until `rateUntil`): stars, what went well, and a comment only the
 * salon sees. After `rateUntil` the rating stays as it was, read only.
 * @param focus opened from the "How was your visit?" message: the card is scrolled to and its first star focused
 */
export function RateVisit({ booking, focus }: { booking: Booking; focus: boolean }) {
  const rate = useRateVisit()
  const mine = booking.rating
  const [editing, setEditing] = useState(mine === null)
  const [stars, setStars] = useState(mine?.stars ?? 0)
  const [tags, setTags] = useState<RatingTag[]>(mine?.tags ?? [])
  const [comment, setComment] = useState(mine?.comment ?? '')
  const [saved, setSaved] = useState(false)
  const first = useRef<HTMLButtonElement | null>(null)
  const [now] = useState(Date.now)
  const open = canRate(booking.rateUntil, now) && !isApiError(rate.error, 'RATING_CLOSED')
  const commentError = fieldError(rate.error, 'comment')

  useEffect(() => {
    if (focus && open && first.current) {
      first.current.scrollIntoView({ block: 'center' })
      first.current.focus()
    }
  }, [focus, open])

  if (!open && !mine) {
    // Closed while the form was open: say so, rather than the form just vanishing
    return isApiError(rate.error, 'RATING_CLOSED') ? <Banner tone="warn">{messageOf(rate.error)}</Banner> : null
  }

  if (mine && (!editing || !open)) {
    return (
      <Card className="flex flex-col gap-2">
        <p className="font-semibold">Your rating</p>
        <p role="img" aria-label={`${mine.stars} out of 5 stars`} className="text-2xl text-warn">
          <span aria-hidden>{'★'.repeat(mine.stars) + '☆'.repeat(5 - mine.stars)}</span>
        </p>
        {mine.tags.length > 0 && (
          <p className="text-sm text-muted">{mine.tags.map((t) => TAGS.find((x) => x.tag === t)?.label).join(' · ')}</p>
        )}
        {mine.comment && <p className="break-words text-sm">“{mine.comment}”</p>}
        {saved && <Banner tone="good">Thanks! The salon sees your rating.</Banner>}
        {open && (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Change rating
          </Button>
        )}
        {open && <p className="text-xs text-muted">You can change it until {dateTimeIst(booking.rateUntil!)}.</p>}
      </Card>
    )
  }

  const save = () =>
    rate.mutate(
      { id: booking.id, rating: { stars, tags, comment: comment.trim() || null } },
      {
        onSuccess: () => {
          setEditing(false)
          setSaved(true)
        },
      },
    )

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <p className="font-semibold">How was your visit?</p>
        <p className="text-sm text-muted">It helps others choose, and tells {booking.salonName} what went well.</p>
      </div>
      <div role="radiogroup" aria-label="Stars" className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            ref={n === 1 ? first : undefined}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            onClick={() => setStars(n)}
            className={`min-h-12 min-w-12 text-4xl ${n <= stars ? 'text-warn' : 'text-line'}`}
          >
            ★
          </button>
        ))}
      </div>
      {stars > 0 && <p className="text-sm text-muted">{WORDS[stars]}</p>}
      <div role="group" aria-label="What went well" className="flex flex-wrap gap-2">
        {TAGS.map((t) => (
          <Chip
            key={t.tag}
            selected={tags.includes(t.tag)}
            onClick={() => setTags(tags.includes(t.tag) ? tags.filter((x) => x !== t.tag) : [...tags, t.tag])}
          >
            {t.label}
          </Chip>
        ))}
      </div>
      <label className="flex flex-col gap-2 text-sm">
        <span className="font-medium text-muted">Anything to tell the salon? (only they see it)</span>
        <textarea
          value={comment}
          maxLength={MAX_COMMENT}
          rows={3}
          onChange={(e) => setComment(e.target.value)}
          aria-invalid={commentError ? true : undefined}
          aria-describedby={commentError ? 'rate-comment-error' : undefined}
          className="rounded-xl border border-line bg-surface p-3 text-base text-ink focus:border-brand focus:outline-none"
        />
        {commentError && (
          <span id="rate-comment-error" className="text-sm text-bad">
            The comment {commentError}.
          </span>
        )}
        <span className="self-end text-xs text-muted">
          {comment.length}/{MAX_COMMENT}
        </span>
      </label>
      {rate.isError && !commentError && <Banner tone="bad">{messageOf(rate.error)}</Banner>}
      <Button busy={rate.isPending} disabled={stars === 0} onClick={save}>
        {mine ? 'Save rating' : 'Send rating'}
      </Button>
      {mine && (
        <Button
          variant="secondary"
          onClick={() => {
            // The next "Change rating" starts from the saved rating, not from these abandoned changes
            setStars(mine.stars)
            setTags(mine.tags)
            setComment(mine.comment ?? '')
            rate.reset()
            setEditing(false)
          }}
        >
          Keep my rating
        </Button>
      )}
    </Card>
  )
}
